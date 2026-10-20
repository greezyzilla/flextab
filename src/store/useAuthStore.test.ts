import { getSpaces, setSpaces } from "~src/lib/yjsDoc";
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuthStore } from './useAuthStore';
import { clearTokens } from '~src/services/api';

const GUEST_KEY = 'flextab_guest_mode';

// onChanged listeners are registered at module load — capture before any clearAllMocks.
const localListeners = ((chrome.storage.onChanged.addListener as any).mock.calls as any[]).map(c => c[0]);
async function fireChange(changes: Record<string, any>, area = 'local') {
  for (const l of localListeners) await l(changes, area);
}

const tokens = () => ({ access_token: 't', refresh_token: 'r', expires_at: Date.now() / 1000 + 3600 });
const jsonRes = (body: unknown, ok = true, status = 200) =>
  ({ ok, status, statusText: 'ERR', json: async () => body } as Response);

beforeEach(async () => {
  vi.clearAllMocks();
  (chrome.storage.local.get as any).mockResolvedValue({});
  (chrome.storage.local.set as any).mockResolvedValue(undefined);
  (chrome.storage.local.remove as any).mockResolvedValue(undefined);
  global.fetch = vi.fn();
  await clearTokens();
  useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: true, guestMode: false });
});

describe('guest mode', () => {
  it('continueAsGuest enables and persists guest mode', async () => {
    await useAuthStore.getState().continueAsGuest();
    expect(useAuthStore.getState().guestMode).toBe(true);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ [GUEST_KEY]: true });
  });

  it('initialize restores persisted guest mode without a session', async () => {
    (chrome.storage.local.get as any).mockImplementation(async (k: any) => {
      const wants = (x: string) => k === x || (Array.isArray(k) && k.includes(x));
      return wants(GUEST_KEY) ? { [GUEST_KEY]: true } : {};
    });
    await useAuthStore.getState().initialize();
    expect(useAuthStore.getState().guestMode).toBe(true);
    expect(useAuthStore.getState().isLoading).toBe(false);
  });

  it('logout clears guest mode + per-account sync keys', async () => {
    useAuthStore.setState({ guestMode: true });
    await useAuthStore.getState().logout({ discardLocalData: true });
    expect(useAuthStore.getState().guestMode).toBe(false);
    expect(chrome.storage.local.remove).toHaveBeenCalledWith(['spaces', 'flextab_sync_hydrated', 'flextab_fresh_login', 'flextab_landed_snapshot']);
    expect(chrome.storage.local.remove).toHaveBeenCalledWith('flextab_sync_revision');
  });

  it('logout clears the merge base (per-account — a real sign-out, unlike a transient auth drop, should forget it)', async () => {
    await useAuthStore.getState().logout({ discardLocalData: true });
    expect(chrome.storage.local.remove).toHaveBeenCalledWith('flextab_merge_base');
  });
});

describe('session restore (initialize with tokens)', () => {
  beforeEach(() => {
    (chrome.storage.local.get as any).mockImplementation(async (k: any) =>
      k === 'auth_tokens' ? { auth_tokens: tokens() } : {});
  });

  it('authenticates and loads the user', async () => {
    (global.fetch as any).mockResolvedValue(jsonRes({ id: 'u', email: 'e', name: 'n', avatar: '', provider: 'google', has_password: false }));
    await useAuthStore.getState().initialize();
    const s = useAuthStore.getState();
    expect(s.isAuthenticated).toBe(true);
    expect(s.user?.id).toBe('u');
    expect(s.isLoading).toBe(false);
  });

  it('stays authenticated (local-first) when the BE is unreachable', async () => {
    // server error / BE down — not a token rejection, so keep the cached session
    (global.fetch as any).mockResolvedValue(jsonRes({}, false, 500));
    await useAuthStore.getState().initialize();
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('stays authenticated when fetch outright fails (offline)', async () => {
    (global.fetch as any).mockRejectedValue(new TypeError('Failed to fetch'));
    await useAuthStore.getState().initialize();
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('signs out only when the token is rejected (401)', async () => {
    (global.fetch as any).mockResolvedValue(jsonRes({}, false, 401));
    await useAuthStore.getState().initialize();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
  });
});

describe('login flows', () => {
  it.each(['Google', 'Github'] as const)('loginWith%s asks the worker to start a correlated attempt', async provider => {
    await useAuthStore.getState()[`loginWith${provider}`]();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'flextab.oauth.start', provider: provider.toLowerCase() });
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  it('loginWithEmail authenticates and flags a fresh login', async () => {
    (global.fetch as any)
      .mockResolvedValueOnce(jsonRes(tokens()))                                              // apiLogin
      .mockResolvedValueOnce(jsonRes({ id: 'u', email: 'e', name: 'n', avatar: '', provider: 'email', has_password: true })); // /api/me
    await useAuthStore.getState().loginWithEmail('e', 'p');
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().user?.id).toBe('u');
    expect(chrome.storage.local.set).toHaveBeenCalledWith(expect.objectContaining({ flextab_fresh_login: true }));
  });

  it('register authenticates', async () => {
    (global.fetch as any)
      .mockResolvedValueOnce(jsonRes(tokens()))
      .mockResolvedValueOnce(jsonRes({ id: 'u2', email: 'e', name: 'n', avatar: '', provider: 'email', has_password: true }));
    await useAuthStore.getState().register('e', 'p', 'n');
    expect(useAuthStore.getState().user?.id).toBe('u2');
  });
});

describe('chrome.storage.onChanged listener', () => {
  it('ignores non-local areas', async () => {
    await expect(fireChange({ auth_tokens: { newValue: {} } }, 'sync')).resolves.toBeUndefined();
  });

  it('signs out when the token is removed while authenticated', async () => {
    useAuthStore.setState({ isAuthenticated: true, user: { id: 'u' } as any });
    await fireChange({ auth_tokens: { newValue: null } });
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('updates guest mode from a cross-tab change', async () => {
    await fireChange({ [GUEST_KEY]: { newValue: true } });
    expect(useAuthStore.getState().guestMode).toBe(true);
  });

  it('runs the callback when a token appears while unauthenticated', async () => {
    useAuthStore.setState({ isAuthenticated: false });
    (global.fetch as any).mockResolvedValue(jsonRes({ id: 'u9', email: '', name: '', avatar: '', provider: '', has_password: false }));
    const received = tokens();
    (chrome.storage.local.get as any).mockResolvedValue({ auth_tokens: received });
    await fireChange({ auth_tokens: { newValue: received } });
    await new Promise(r => setTimeout(r, 0)); // let the fire-and-forget callback settle
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });
});

it('does not replay a delayed token storage event over a newer session', async () => {
  const latest = { ...tokens(), access_token: 'newer', refresh_token: 'newer-refresh' };
  (chrome.storage.local.get as any).mockResolvedValue({ auth_tokens: latest });
  await useAuthStore.getState().handleAuthCallback(tokens(), true);
  expect(chrome.storage.local.set).not.toHaveBeenCalled();
  expect(global.fetch).not.toHaveBeenCalled();
});

it.each([false, true])('clears the previous identity while accepted login loads its profile (failure=%s)', async fail => {
  const previous = { id: 'A', email: 'a@example.invalid', name: 'A', avatar: '', provider: 'email', has_password: true };
  useAuthStore.setState({ isAuthenticated: true, user: previous });
  let resolve!: (response: Response) => void;
  let reject!: (error: Error) => void;
  vi.mocked(global.fetch).mockReturnValue(new Promise<Response>((yes, no) => { resolve = yes; reject = no; }));
  const login = useAuthStore.getState().handleAuthCallback(tokens());
  await vi.waitFor(() => expect(global.fetch).toHaveBeenCalled());
  expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: true, user: null });
  if (fail) {
    const rejected = expect(login).rejects.toThrow('profile unavailable');
    reject(new Error('profile unavailable'));
    await rejected;
    expect(useAuthStore.getState().user).toBeNull();
  } else {
    resolve(jsonRes({ ...previous, id: 'B' }));
    await login;
    expect(useAuthStore.getState().user?.id).toBe('B');
  }
});

describe('destructive logout authorization', () => {
  it.each([undefined, {}, { discardLocalData: false }, { type: 'click' }])('rejects missing confirmation %j before clearing data or tokens', async confirmation => {
    setSpaces([{ id: 'local', name: 'Not synced', projects: [] }]);
    useAuthStore.setState({ isAuthenticated: true });
    vi.clearAllMocks();
    await expect(useAuthStore.getState().logout(confirmation as any)).rejects.toThrow('Confirm local data deletion');
    expect(getSpaces()[0].name).toBe('Not synced');
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(chrome.storage.local.remove).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('waits for in-flight sync before clearing the workspace and its receipt', async () => {
    setSpaces([{ id: 'local', name: 'Not synced', projects: [] }]);
    let release!: () => Promise<void>;
    let finish!: () => void;
    const queued = new Promise<void>(resolve => { finish = resolve; });
    const request = vi.fn((_name: string, work: () => Promise<void>) => {
      release = async () => { await work(); finish(); };
      return queued;
    });
    Object.defineProperty(navigator, 'locks', { value: { request }, configurable: true });
    try {
      const run = useAuthStore.getState().logout({ discardLocalData: true });
      expect(request).toHaveBeenCalledWith('flextab-structured-sync', expect.any(Function));
      expect(getSpaces()[0].name).toBe('Not synced');
      expect(chrome.storage.local.remove).not.toHaveBeenCalledWith('flextab_landed_snapshot');
      await release();
      await run;
      expect(getSpaces()).toEqual([]);
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    } finally { Reflect.deleteProperty(navigator, 'locks'); }
  });
});
