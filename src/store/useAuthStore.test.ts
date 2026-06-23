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
    await useAuthStore.getState().logout();
    expect(useAuthStore.getState().guestMode).toBe(false);
    expect(chrome.storage.local.remove).toHaveBeenCalledWith(['spaces', 'flextab_sync_hydrated', 'flextab_fresh_login']);
    expect(chrome.storage.local.remove).toHaveBeenCalledWith('flextab_sync_revision');
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

  it('falls back to unauthenticated when fetchUser fails', async () => {
    (global.fetch as any).mockResolvedValue(jsonRes({}, false, 500));
    await useAuthStore.getState().initialize();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
  });
});

describe('login flows', () => {
  it('loginWithGoogle opens the auth tab', () => {
    useAuthStore.getState().loginWithGoogle();
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: expect.stringContaining('/api/auth/google') });
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
    await fireChange({ auth_tokens: { newValue: tokens() } });
    await new Promise(r => setTimeout(r, 0)); // let the fire-and-forget callback settle
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });
});
