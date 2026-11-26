import { getSpaces, setSpaces } from "~src/lib/yjsDoc";
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuthStore } from './useAuthStore';
import { clearTokens, saveTokens } from '~src/services/api';
import { toast } from 'sonner';

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

describe('local-first sign-out', () => {
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
    expect(chrome.storage.local.remove).toHaveBeenCalledWith(['flextab_sync_hydrated', 'flextab_fresh_login', 'flextab_landed_snapshot', 'flextab_limit_notice', 'flextab_resolution_push']);
    expect(chrome.storage.local.remove).toHaveBeenCalledWith('flextab_sync_revision');
    // No base afterwards: the next sign-in, to any account, reconciles explicitly,
    // and must ask before these tabs go anywhere.
    expect(chrome.storage.local.remove).toHaveBeenCalledWith('flextab_merge_base');
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ flextab_kept_on_signout: true });
  });

  it('logout "remove" also deletes the local workspace', async () => {
    setSpaces([{ id: 'local', name: 'Mine', projects: [] }]);
    await useAuthStore.getState().logout({ localData: 'remove' });
    expect(getSpaces()).toEqual([]);
    expect(chrome.storage.local.remove).toHaveBeenCalledWith(['flextab_sync_hydrated', 'flextab_fresh_login', 'flextab_landed_snapshot', 'flextab_limit_notice', 'flextab_resolution_push', 'spaces']);
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
  it.each(['Google', 'Github', 'Gitlab', 'Discord'] as const)('loginWith%s asks the worker to start a correlated attempt', async provider => {
    await useAuthStore.getState()[`loginWith${provider}`]();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'flextab.oauth.start', provider: provider.toLowerCase() });
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  it('tells the user when the worker refuses to start sign-in', async () => {
    const error = vi.spyOn(toast, 'error').mockImplementation(() => 0 as any);
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValueOnce({ ok: false } as never);
    await useAuthStore.getState().loginWithGoogle();
    expect(error).toHaveBeenCalledWith('Sign-in could not start. Please try again.');
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    error.mockRestore();
  });

  it('tells the user when the worker cannot be reached', async () => {
    const error = vi.spyOn(toast, 'error').mockImplementation(() => 0 as any);
    vi.mocked(chrome.runtime.sendMessage).mockRejectedValueOnce(new Error('Receiving end does not exist.'));
    await useAuthStore.getState().loginWithGithub();
    expect(error).toHaveBeenCalledWith('Sign-in could not start. Please try again.');
    error.mockRestore();
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

  it('ignores local changes that do not touch the tokens', async () => {
    useAuthStore.setState({ isAuthenticated: true, user: { id: 'u' } as any });
    await fireChange({ flextab_user: { newValue: null } });
    expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: true, user: { id: 'u' } });
  });

  it('ignores a token removal while already signed out, and a new token while signed in', async () => {
    useAuthStore.setState({ isAuthenticated: false, user: null });
    await fireChange({ auth_tokens: { oldValue: tokens(), newValue: undefined } });
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    useAuthStore.setState({ isAuthenticated: true, user: { id: 'u' } as any });
    await fireChange({ auth_tokens: { newValue: tokens() } });
    expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: true, user: { id: 'u' } });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('signs in from a token written elsewhere even when /api/me is unreachable', async () => {
    useAuthStore.setState({ isAuthenticated: false });
    (global.fetch as any).mockRejectedValue(new TypeError('Failed to fetch'));
    const received = tokens();
    (chrome.storage.local.get as any).mockResolvedValue({ auth_tokens: received });
    await fireChange({ auth_tokens: { newValue: received } });
    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalled());
    await new Promise(r => setTimeout(r, 0));
    expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: true, user: null });
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

describe('delete account', () => {
  it('deletes on the server, then forgets the account here and keeps the tabs when asked', async () => {
    await saveTokens(tokens());
    setSpaces([{ id: 'local', name: 'Mine', projects: [] }]);
    useAuthStore.setState({ isAuthenticated: true });
    (global.fetch as any).mockResolvedValue(jsonRes({ deleted: true }));
    await useAuthStore.getState().deleteAccount('me@example.com', { localData: 'keep' });
    const [url, init] = (global.fetch as any).mock.calls.at(-1);
    expect(String(url)).toMatch(/\/api\/me$/);
    expect(init).toMatchObject({ method: 'DELETE', body: JSON.stringify({ email: 'me@example.com' }) });
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(getSpaces()[0].name).toBe('Mine');
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ flextab_kept_on_signout: true });
  });

  it('leaves the account and this device untouched when the server refuses', async () => {
    await saveTokens(tokens());
    setSpaces([{ id: 'local', name: 'Mine', projects: [] }]);
    useAuthStore.setState({ isAuthenticated: true });
    (global.fetch as any).mockResolvedValue(jsonRes({ error: 'Cancel your subscription first, then delete your account.', code: 'subscription_renewing' }, false, 409));
    await expect(useAuthStore.getState().deleteAccount('me@example.com', { localData: 'remove' })).rejects.toMatchObject({ status: 409 });
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(getSpaces()[0].name).toBe('Mine');
    await expect(useAuthStore.getState().deleteAccount('x', {} as never)).rejects.toThrow('Choose what happens');
  });
});

describe('optimistic start from the stored profile', () => {
  const me = { id: 'u', email: 'e@x.test', name: 'Ayu', avatar: '', provider: 'google', has_password: false };
  let store: Record<string, any>;
  beforeEach(async () => {
    await saveTokens(tokens());
    store = { auth_tokens: tokens(), flextab_user: { ...me, name: 'Ayu (stored)' } };
    (chrome.storage.local.get as any).mockImplementation(async (k: any) => (typeof k === 'string' ? (k in store ? { [k]: store[k] } : {}) : {}));
    (chrome.storage.local.set as any).mockImplementation(async (o: any) => { Object.assign(store, o); });
    (chrome.storage.local.remove as any).mockImplementation(async (k: any) => { for (const x of [k].flat()) delete store[x]; });
  });

  it('opens from the stored profile without waiting for /api/me, then refreshes it', async () => {
    let answer!: (r: Response) => void;
    (global.fetch as any).mockReturnValue(new Promise<Response>((r) => { answer = r; }));
    await useAuthStore.getState().initialize();
    expect(useAuthStore.getState()).toMatchObject({ isLoading: false, isAuthenticated: true });
    expect(useAuthStore.getState().user?.name).toBe('Ayu (stored)');
    answer(jsonRes(me));
    await vi.waitFor(() => expect(useAuthStore.getState().user?.name).toBe('Ayu'));
    expect(store.flextab_user.name).toBe('Ayu');
  });

  it('signs out when /api/me rejects the token in the background, and forgets the profile', async () => {
    (global.fetch as any).mockResolvedValue(jsonRes({ error: 'unauthorized' }, false, 401));
    await useAuthStore.getState().initialize();
    await vi.waitFor(() => expect(useAuthStore.getState().isAuthenticated).toBe(false));
    expect(useAuthStore.getState().user).toBeNull();
    expect(store.flextab_user).toBeUndefined();
  });

  it('keeps the stored account when the server is unreachable', async () => {
    (global.fetch as any).mockRejectedValue(new TypeError('Failed to fetch'));
    await useAuthStore.getState().initialize();
    await new Promise((r) => setTimeout(r, 0));
    expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: true, isLoading: false });
    expect(useAuthStore.getState().user?.name).toBe('Ayu (stored)');
  });

  it('waits for /api/me when the stored profile cannot be read', async () => {
    const read = (chrome.storage.local.get as any).getMockImplementation();
    (chrome.storage.local.get as any).mockImplementation(async (k: any) => {
      if (k === 'flextab_user') throw new Error('storage unavailable');
      return read(k);
    });
    (global.fetch as any).mockResolvedValue(jsonRes(me));
    await useAuthStore.getState().initialize();
    expect(useAuthStore.getState()).toMatchObject({ isLoading: false, isAuthenticated: true, user: me });
  });

  it('waits for /api/me when no profile is stored yet', async () => {
    delete store.flextab_user;
    let answer!: (r: Response) => void;
    (global.fetch as any).mockReturnValue(new Promise<Response>((r) => { answer = r; }));
    const started = useAuthStore.getState().initialize();
    await new Promise((r) => setTimeout(r, 0));
    expect(useAuthStore.getState().isLoading).toBe(true);
    answer(jsonRes(me));
    await started;
    expect(useAuthStore.getState()).toMatchObject({ isLoading: false, user: me });
    expect(store.flextab_user).toEqual(me);
  });

  it('a sign-out forgets the stored profile', async () => {
    useAuthStore.setState({ isAuthenticated: true, user: me });
    (global.fetch as any).mockResolvedValue(jsonRes({}));
    await useAuthStore.getState().logout({ localData: 'keep' });
    expect(store.flextab_user).toBeUndefined();
  });

  it('a new login forgets the old profile, and a late /api/me for the old session is dropped', async () => {
    let answerOld!: (r: Response) => void;
    (global.fetch as any).mockReturnValueOnce(new Promise<Response>((r) => { answerOld = r; }))
    useAuthStore.setState({ isAuthenticated: true, user: me });
    const old = useAuthStore.getState().fetchUser().catch(() => {});
    (global.fetch as any).mockResolvedValue(jsonRes({ ...me, id: 'v', name: 'Budi' }));
    await useAuthStore.getState().handleAuthCallback({ ...tokens(), access_token: 't2', refresh_token: 'r2' });
    expect(useAuthStore.getState().user?.name).toBe('Budi');
    answerOld(jsonRes(me));
    await old;
    expect(useAuthStore.getState().user?.name).toBe('Budi');
    expect(store.flextab_user.name).toBe('Budi');
  });
});

describe('without an extension storage event source', () => {
  it('loads and signs in by email without listening for changes', async () => {
    vi.resetModules();
    const saved = chrome.storage.onChanged;
    (chrome.storage as any).onChanged = undefined;
    try {
      const { useAuthStore: fresh } = await import('./useAuthStore');
      (global.fetch as any)
        .mockResolvedValueOnce(jsonRes(tokens()))
        .mockResolvedValueOnce(jsonRes({ id: 'u', email: 'e', name: 'n', avatar: '', provider: 'email', has_password: true }));
      await fresh.getState().loginWithEmail('e', 'p');
      expect(fresh.getState().user?.id).toBe('u');
    } finally {
      (chrome.storage as any).onChanged = saved;
    }
  });
});
