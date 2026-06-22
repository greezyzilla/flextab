import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuthStore } from './useAuthStore';

const GUEST_KEY = 'flextab_guest_mode';

describe('useAuthStore — guest mode', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: true, guestMode: false });
    vi.clearAllMocks();
    // Default: nothing stored.
    (chrome.storage.local.get as any).mockResolvedValue({});
  });

  it('continueAsGuest enables guest mode and persists it', async () => {
    await useAuthStore.getState().continueAsGuest();
    expect(useAuthStore.getState().guestMode).toBe(true);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ [GUEST_KEY]: true });
  });

  it('initialize restores persisted guest mode when there is no session', async () => {
    (chrome.storage.local.get as any).mockImplementation((keys: any) => {
      const wants = (k: string) => keys === k || (Array.isArray(keys) && keys.includes(k));
      return Promise.resolve(wants(GUEST_KEY) ? { [GUEST_KEY]: true } : {});
    });

    await useAuthStore.getState().initialize();

    expect(useAuthStore.getState().guestMode).toBe(true);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().isLoading).toBe(false);
  });

  it('logout clears guest mode and its persisted flag', async () => {
    useAuthStore.setState({ guestMode: true });

    await useAuthStore.getState().logout();

    expect(useAuthStore.getState().guestMode).toBe(false);
    expect(chrome.storage.local.remove).toHaveBeenCalledWith(GUEST_KEY);
  });

  it('logout clears the sync hydration flag and stored revision', async () => {
    await useAuthStore.getState().logout();

    // Per-session/per-account sync state must not leak to the next user.
    expect(chrome.storage.local.remove).toHaveBeenCalledWith(['spaces', 'flextab_sync_hydrated', 'flextab_fresh_login']);
    expect(chrome.storage.local.remove).toHaveBeenCalledWith('flextab_sync_revision');
  });
});
