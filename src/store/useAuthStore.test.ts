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
  useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: true });
});

describe('local-first sign-out (TASK-7)', () => {
  it('initialize drops the legacy guest flag', async () => {
    await useAuthStore.getState().initialize();
    expect(chrome.storage.local.remove).toHaveBeenCalledWith(GUEST_KEY);
    expect(useAuthStore.getState().isLoading).toBe(false);
  });

  it('logout "keep" leaves the workspace and forgets only the account', async () => {
    setSpaces([{ id: 'local', name: 'Mine', projects: [] }]);
    useAuthStore.setState({ isAuthenticated: true });
    await useAuthStore.getState().logout({ localData: 'keep' });
    expect(getSpaces()[0].name).toBe('Mine');
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(chrome.storage.local.remove).toHaveBeenCalledWith(['flextab_sync_hydrated', 'flextab_fresh_login', 'flextab_landed_snapshot']);
    expect(chrome.storage.local.remove).toHaveBeenCalledWith('flextab_sync_revision');
    // No base afterwards: the next sign-in, to any account, reconciles explicitly,
    // and must ask before these tabs go anywhere (TASK-11).
    expect(chrome.storage.local.remove).toHaveBeenCalledWith('flextab_merge_base');
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ flextab_kept_on_signout: true });
  });

  it('logout "remove" also deletes the local workspace', async () => {
    setSpaces([{ id: 'local', name: 'Mine', projects: [] }]);
    await useAuthStore.getState().logout({ localData: 'remove' });
    expect(getSpaces()).toEqual([]);
    expect(chrome.storage.local.remove).toHaveBeenCalledWith(['flextab_sync_hydrated', 'flextab_fresh_login', 'flextab_landed_snapshot', 'spaces']);
    expect(chrome.storage.local.remove).toHaveBeenCalledWith('flextab_merge_base');
    expect(chrome.storage.local.remove).toHaveBeenCalledWith('flextab_kept_on_signout');
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

describe('sign-out authorization', () => {
  it.each([undefined, {}, { discardLocalData: true }, { localData: 'maybe' }, { type: 'click' }])('rejects a missing local-data choice %j before clearing data or tokens', async confirmation => {
    setSpaces([{ id: 'local', name: 'Not synced', projects: [] }]);
    useAuthStore.setState({ isAuthenticated: true });
    vi.clearAllMocks();
    await expect(useAuthStore.getState().logout(confirmation as any)).rejects.toThrow('Choose what happens to local data');
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
      const run = useAuthStore.getState().logout({ localData: 'remove' });
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
