import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { SavedSpace } from '~src/types';

beforeEach(() => {
  vi.clearAllMocks();
  (chrome.storage.local.get as any).mockResolvedValue({});
  (chrome.storage.local.set as any).mockResolvedValue(undefined);
  (chrome.storage.local.remove as any).mockResolvedValue(undefined);
});

describe('utils barrel', () => {
  it('re-exports the utilities', async () => {
    const mod = await import('~src/utils');
    expect(mod.faviconToDataUrl).toBeTypeOf('function');
    expect(mod.WindowManager).toBeTruthy();
  });
});

describe('spacesMerge — sparse/deep-collision branches', () => {
  it('handles missing nested arrays at every level', async () => {
    const { mergeSpaces } = await import('~src/services/spacesMerge');
    // local-only sparse spaces exercise spaceTabCount's `|| []` fallbacks
    const sparseLocalOnly = [
      { id: 'q', name: 'Q', order: 0, projects: [{ id: 'qp', name: 'P', order: 0 }] },          // project w/o categories
      { id: 'r', name: 'R', order: 0, projects: [{ id: 'rp', name: 'P', order: 0, categories: [{ id: 'rc', name: 'C', order: 0 }] }] }, // category w/o groups
    ] as unknown as SavedSpace[];
    expect(mergeSpaces([], sparseLocalOnly).map(s => s.id).sort()).toEqual(['q', 'r']);

    // same-id collisions with missing leaf arrays exercise mergeSpace→…→mergeGroup
    const server = [{ id: 'x', name: 'X', order: 0, projects: [{ id: 'p', name: 'P', order: 0, categories: [{ id: 'c', name: 'C', order: 0, groups: [{ id: 'g', name: 'G', order: 0 }] }] }] }] as unknown as SavedSpace[];
    const local = JSON.parse(JSON.stringify(server)) as SavedSpace[];
    const out = mergeSpaces(server, local);
    expect(out).toHaveLength(1);
  });
});

describe('api — fallback branches', () => {
  it('apiLogin falls back to statusText when the error body is empty', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'ServerError', json: async () => ({}) } as Response);
    const { apiLogin } = await import('~src/services/api');
    await expect(apiLogin('e', 'p')).rejects.toMatchObject({ message: 'ServerError' });
  });
});

describe('revision — clear catch branch', () => {
  it('clearStoredRevision swallows a storage error', async () => {
    const { clearStoredRevision } = await import('~src/services/revision');
    (chrome.storage.local.remove as any).mockRejectedValue(new Error('x'));
    await expect(clearStoredRevision()).resolves.toBeUndefined();
  });
});

describe('useAuthStore — storage catch branches', () => {
  it('initialize swallows a failing legacy-flag cleanup', async () => {
    const { useAuthStore } = await import('~src/store/useAuthStore');
    (chrome.storage.local.get as any).mockRejectedValue(new Error('no ctx'));
    (chrome.storage.local.remove as any).mockImplementation(() => { throw new Error('no ctx'); });
    await useAuthStore.getState().initialize();
    expect(useAuthStore.getState().isLoading).toBe(false);
  });
});

describe('syncStorage — error branches', () => {
  it('warns when the debounced sync write fails', async () => {
    vi.useFakeTimers();
    chrome.storage.sync = { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockRejectedValue(new Error('quota')), remove: vi.fn() } as any;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { storage } = await import('~src/store/syncStorage');
    await storage.setItem('k', JSON.stringify({ state: {}, version: 1 }));
    await vi.advanceTimersByTimeAsync(2000);
    expect(warn).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('treats a non-JSON local value as timestamp 0 during cross-device merge', async () => {
    chrome.storage.sync = {
      get: vi.fn().mockImplementation(async (key: string) =>
        key === 'store__meta' ? { store__meta: { chunks: 1, ts: 1 } } : { store__0: JSON.stringify({ state: { lastModified: 5 } }) }),
      set: vi.fn().mockResolvedValue(undefined), remove: vi.fn(),
    } as any;
    (chrome.storage.local.get as any).mockResolvedValue({ store: 'not-json' }); // extractTimestamp → 0
    const { setupStorageSync } = await import('~src/store/syncStorage');
    const rehydrate = vi.fn().mockResolvedValue(undefined);
    setupStorageSync('store', rehydrate);
    const calls = (chrome.storage.onChanged.addListener as any).mock.calls;
    await calls[calls.length - 1][0]({ store__0: { newValue: 'x' } }, 'sync');
    expect(rehydrate).toHaveBeenCalled(); // sync (ts 5) > local (ts 0) → applied
  });
});

describe('revision — cross-context cache listener', () => {
  it('updates the cache when another context writes the revision', async () => {
    vi.resetModules();
    const before = (chrome.storage.onChanged.addListener as any).mock.calls.length;
    const rev = await import('~src/services/revision');
    const listener = (chrome.storage.onChanged.addListener as any).mock.calls[before][0];
    listener({ flextab_sync_revision: { newValue: 42 } }, 'local');
    (chrome.storage.local.get as any).mockResolvedValue({});
    expect(await rev.getStoredRevision()).toBe(42);
  });
});

describe('useAuthStore — storage set/remove catch branches', () => {
  it('handleAuthCallback and logout swallow storage errors', async () => {
    vi.resetModules();
    const { useAuthStore } = await import('~src/store/useAuthStore');
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 'u', email: '', name: '', avatar: '', provider: '', has_password: false }) } as Response);
    (chrome.storage.local.set as any).mockRejectedValue(new Error('x'));
    await useAuthStore.getState().handleAuthCallback({ access_token: 't', refresh_token: 'r', expires_at: Date.now() / 1000 + 3600 });
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    (chrome.storage.local.remove as any).mockRejectedValue(new Error('x'));
    await useAuthStore.getState().logout({ localData: 'remove' });
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});

describe('useSavedSpacesStore — hydrate', () => {
  it('hydrateYjs + useHydrated resolve', async () => {
    const store = await import('~src/store/useSavedSpacesStore');
    store.resetYjsHydration();
    await store.hydrateYjs();
    const { result } = renderHook(() => store.useHydrated());
    // eventually true (effect runs async)
    await vi.waitFor(() => expect(result.current).toEqual({ hydrated: true, error: false }));
  });
});
