import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./api', () => ({
  apiFetch: vi.fn(),
  loadTokens: vi.fn(async () => ({ access_token: 't', refresh_token: 'r', expires_at: 0 })),
  getDeviceId: vi.fn(async () => 'dev1'),
  API_BASE_URL: 'http://localhost:3000',
}));
vi.mock('./revision', () => ({ setStoredRevision: vi.fn(async () => {}) }));
vi.mock('~src/store/useAuthStore', () => ({ useAuthStore: { getState: vi.fn(() => ({ isAuthenticated: true })), subscribe: vi.fn(() => () => {}) } }));
vi.mock('~src/store/useSavedSpacesStore', () => ({ ensureDefaultData: vi.fn(), syncActiveSelection: vi.fn() }));

import {
  startSyncEngine, stopSyncEngine, syncNow, pullAndOverwrite, resolveConflict,
  dismissMergeConflicts, startLocalPersistence, stopLocalPersistence,
} from './syncEngine';
import { apiFetch, loadTokens } from './api';
import { useAuthStore } from '~src/store/useAuthStore';
import { ensureDefaultData } from '~src/store/useSavedSpacesStore';
import { useSyncStore } from '~src/store/useSyncStore';
import { useSyncConflict } from '~src/store/useSyncConflict';
import { setSpaces, getSpaces, addSpace, clearState } from '~src/lib/yjsDoc';
import { clearMergeBase, getMergeBase } from './mergeBase';
import { clearConflictPending } from './conflictState';

// --- Fake WebSocket ---
class FakeWS {
  static instances: FakeWS[] = [];
  static OPEN = 1;
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) { FakeWS.instances.push(this); }
  send() {}
  close() { this.readyState = 3; }
  open() { this.readyState = 1; this.onopen?.(); }
  message(data: unknown) { this.onmessage?.({ data: JSON.stringify(data) }); }
  fireClose() { this.readyState = 3; this.onclose?.(); }
}
(global as any).WebSocket = FakeWS;

const flush = () => new Promise((r) => setTimeout(r, 0));
const tabOf = (t: { id: string }) => ({ id: t.id, url: 'u', title: 't', favicon: '', order: 0 });
const groups = (tabs: { id: string }[]) => [{ id: 'g', name: 'G', order: 0, tabs: tabs.map(tabOf) }];
const beSpace = (id: string, tabs: { id: string }[] = []) => ({
  id, name: id, icon: '', order: 0,
  projects: [{ id: id + 'p', name: 'P', order: 0, categories: [{ id: id + 'c', name: 'C', order: 0, groups: groups(tabs) }] }],
});
const localSpace = (id: string, tabs: { id: string }[] = []) => ({
  id, name: id, order: 0,
  projects: [{ id: id + 'p', name: 'P', order: 0, categories: [{ id: id + 'c', name: 'C', order: 0, groups: groups(tabs) }] }],
});

beforeEach(async () => {
  vi.clearAllMocks();
  (chrome.storage.local.get as any).mockResolvedValue({});
  (chrome.storage.local.set as any).mockResolvedValue(undefined);
  (chrome.storage.local.remove as any).mockResolvedValue(undefined);
  (useAuthStore.getState as any).mockReturnValue({ isAuthenticated: true });
  (loadTokens as any).mockResolvedValue({ access_token: 't', refresh_token: 'r', expires_at: 0 });
  FakeWS.instances = [];
  useSyncStore.getState().reset();
  useSyncConflict.getState().close();
  await clearState();
});

afterEach(() => {
  stopSyncEngine();
  stopLocalPersistence();
  // stopSyncEngine no longer clears the merge base (that's now logout()-only,
  // in production — see useAuthStore.ts), so tests must reset it explicitly
  // for isolation between cases in this file.
  void clearMergeBase();
  void clearConflictPending(); // reset the persisted-flag module cache between cases
});

describe('startSyncEngine', () => {
  it('does nothing when unauthenticated', async () => {
    (useAuthStore.getState as any).mockReturnValue({ isAuthenticated: false });
    await startSyncEngine();
    await flush();
    expect(apiFetch).not.toHaveBeenCalled();
    expect(FakeWS.instances).toHaveLength(0);
  });

  it('reconciles an empty account → default workspace, then connects', async () => {
    (apiFetch as any).mockResolvedValue({ spaces: [], revision: 0 });
    await startSyncEngine();
    await flush();
    expect(apiFetch).toHaveBeenCalledWith('/api/sync');
    expect(ensureDefaultData).toHaveBeenCalled();
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ flextab_sync_hydrated: true });
    expect(FakeWS.instances).toHaveLength(1);
    FakeWS.instances[0].open();
    expect(useSyncStore.getState().status).toBe('online');
  });

  it('takes server data when local is empty', async () => {
    (apiFetch as any).mockResolvedValue({ spaces: [beSpace('srv', [{ id: 't1' }])], revision: 2 });
    await startSyncEngine();
    await flush();
    expect(getSpaces().map(s => s.id)).toEqual(['srv']);
  });

  it('advances merge-base when applied tree equals the GET server (FE-B1 serverConfirmed)', async () => {
    await clearMergeBase();
    (apiFetch as any).mockResolvedValue({ spaces: [beSpace('srv', [{ id: 't1' }])], revision: 2 });
    await startSyncEngine();
    await flush();
    const base = await getMergeBase();
    expect(base?.map((s) => s.id)).toEqual(['srv']);
  });

  it('does not advance merge-base when local-only data is kept for upload (FE-B1)', async () => {
    await clearMergeBase();
    // Server empty, local has tabs → apply keeps local; base waits for confirmed push.
    setSpaces([localSpace('local', [{ id: 'L' }])]);
    (apiFetch as any).mockResolvedValue({ spaces: [], revision: 0 });
    await startSyncEngine();
    await flush();
    expect(await getMergeBase()).toBeNull();
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ flextab_sync_hydrated: true });
  });

  it('does not hydrate/upload when the pull fails, but still attempts to connect', async () => {
    (apiFetch as any).mockRejectedValue(new Error('net'));
    await startSyncEngine();
    await flush();
    // No hydration flag set (we never saw the server), but a socket is attempted
    // so realtime resumes when back online.
    expect(chrome.storage.local.set).not.toHaveBeenCalledWith({ flextab_sync_hydrated: true });
    expect(FakeWS.instances).toHaveLength(1);
  });

  it('goes offline when there is no token to open the socket', async () => {
    (apiFetch as any).mockResolvedValue({ spaces: [], revision: 0 });
    (loadTokens as any).mockResolvedValue(null);
    await startSyncEngine();
    await flush();
    expect(useSyncStore.getState().status).toBe('offline');
    expect(FakeWS.instances).toHaveLength(0);
  });
});

describe('conflict flow', () => {
  beforeEach(() => {
    setSpaces([localSpace('local', [{ id: 'L' }])]); // local has real tabs
    (chrome.storage.local.get as any).mockImplementation(async (k: any) =>
      k === 'flextab_fresh_login' ? { flextab_fresh_login: true } : {});
    (apiFetch as any).mockResolvedValue({ spaces: [beSpace('server', [{ id: 'S' }])], revision: 1 });
  });

  it('opens the conflict modal on a fresh login with data on both sides', async () => {
    await startSyncEngine();
    await flush();
    expect(useSyncConflict.getState().pending).toBe(true);
    expect(FakeWS.instances).toHaveLength(0); // waits for the user
    expect(chrome.storage.local.set).not.toHaveBeenCalledWith({ flextab_sync_hydrated: true });
  });

  it('resolveConflict("merge") applies the union and connects', async () => {
    await startSyncEngine();
    await flush();
    resolveConflict('merge');
    await flush();
    expect(getSpaces().map(s => s.id).sort()).toEqual(['local', 'server']);
    expect(useSyncConflict.getState().pending).toBe(false);
    expect(FakeWS.instances).toHaveLength(1);
  });

  it('resolveConflict("merge") does not advance merge-base before push (FE-B1)', async () => {
    await clearMergeBase();
    await startSyncEngine();
    await flush();
    resolveConflict('merge');
    await flush();
    // Union includes local-only space — not equal to pure server pull → base waits for OCC land.
    expect(await getMergeBase()).toBeNull();
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ flextab_sync_hydrated: true });
  });

  it('resolveConflict is a no-op when nothing is pending', () => {
    useSyncConflict.getState().close();
    expect(() => resolveConflict('server')).not.toThrow();
  });
});

describe('conflict-pending flag', () => {
  it('is set (and persisted) when the merge conflict is dismissed', () => {
    dismissMergeConflicts();
    expect(useSyncStore.getState().conflictPending).toBe(true);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ flextab_conflict_pending: true });
    expect(useSyncStore.getState().status).toBe('paused');
  });

  it('is cleared once the data converges again', async () => {
    dismissMergeConflicts();
    expect(useSyncStore.getState().conflictPending).toBe(true);
    // A converging reconcile (server-only data, clean apply) resolves it.
    setSpaces([]);
    (chrome.storage.local.get as any).mockResolvedValue({});
    (apiFetch as any).mockResolvedValue({ spaces: [beSpace('server', [{ id: 'S' }])], revision: 1 });
    await syncNow();
    await flush();
    expect(useSyncStore.getState().conflictPending).toBe(false);
    expect(chrome.storage.local.remove).toHaveBeenCalledWith('flextab_conflict_pending');
  });

  it('a plain auto-sync-off pause (no pending conflict) does not set it', () => {
    useSyncStore.getState().reset();
    stopSyncEngine();
    expect(useSyncStore.getState().conflictPending).toBe(false);
  });
});

describe('realtime + lifecycle', () => {
  async function connect() {
    (apiFetch as any).mockResolvedValue({ spaces: [], revision: 0 });
    await startSyncEngine();
    await flush();
    FakeWS.instances[0].open();
  }

  it('re-pulls on a sync-full notification', async () => {
    await connect();
    (apiFetch as any).mockClear();
    FakeWS.instances[0].message({ type: 'sync', entity_type: 'full' });
    await flush();
    expect(apiFetch).toHaveBeenCalledWith('/api/sync');
  });

  it('hard-overwrites local on a sync-restore notification', async () => {
    await connect();
    addSpace({ id: 'localOnly', name: 'L', order: 0, projects: [] });
    (apiFetch as any).mockResolvedValue({ spaces: [beSpace('restored', [{ id: 't1' }])], revision: 9 });
    FakeWS.instances[0].message({ type: 'sync', entity_type: 'restore' });
    await flush();
    // server fully replaced local (not merged) — 'localOnly' is gone
    expect(getSpaces().map(s => s.id)).toEqual(['restored']);
  });

  it('ignores unrelated WS messages', async () => {
    await connect();
    (apiFetch as any).mockClear();
    FakeWS.instances[0].message({ type: 'other' });
    FakeWS.instances[0].message('not json' as any);
    await flush();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('goes offline on an unexpected close (still authenticated)', async () => {
    await connect();
    FakeWS.instances[0].fireClose();
    expect(useSyncStore.getState().status).toBe('offline');
  });

  it('does not reconnect after close when signed out', async () => {
    await connect();
    (useAuthStore.getState as any).mockReturnValue({ isAuthenticated: false });
    FakeWS.instances[0].fireClose();
    expect(FakeWS.instances).toHaveLength(1); // no new socket scheduled
  });

  it('onerror closes the socket', async () => {
    await connect();
    expect(() => FakeWS.instances[0].onerror?.()).not.toThrow();
  });

  it('stopSyncEngine disconnects, clears the hydrated flag, and pauses', async () => {
    await connect();
    stopSyncEngine();
    expect(useSyncStore.getState().status).toBe('paused');
    expect(chrome.storage.local.remove).toHaveBeenCalledWith('flextab_sync_hydrated');
  });

  it('stopSyncEngine does NOT clear the merge base — it runs on every auth drop (real or transient, e.g. a refresh-token race), not just a real sign-out', async () => {
    await connect();
    stopSyncEngine();
    expect(chrome.storage.local.remove).not.toHaveBeenCalledWith('flextab_merge_base');
  });
});

describe('syncNow', () => {
  it('returns false when unauthenticated', async () => {
    (useAuthStore.getState as any).mockReturnValue({ isAuthenticated: false });
    expect(await syncNow()).toBe(false);
  });

  it('re-pulls when authenticated', async () => {
    (apiFetch as any).mockResolvedValue({ spaces: [], revision: 0 });
    expect(await syncNow()).toBe(true);
    await flush();
    expect(apiFetch).toHaveBeenCalledWith('/api/sync');
  });
});

describe('pullAndOverwrite (post-restore)', () => {
  it('returns false when unauthenticated', async () => {
    (useAuthStore.getState as any).mockReturnValue({ isAuthenticated: false });
    expect(await pullAndOverwrite()).toBe(false);
  });

  it('overwrites local with the server state (no merge)', async () => {
    setSpaces([]);
    addSpace({ id: 'localOnly', name: 'L', order: 0, projects: [] });
    (apiFetch as any).mockResolvedValue({ spaces: [beSpace('restored', [{ id: 't1' }])], revision: 9 });
    expect(await pullAndOverwrite()).toBe(true);
    await flush();
    // local 'localOnly' is gone — server fully replaced it (not merged)
    expect(getSpaces().map(s => s.id)).toEqual(['restored']);
  });

  it('goes offline when the pull fails', async () => {
    (apiFetch as any).mockRejectedValue(new Error('net'));
    expect(await pullAndOverwrite()).toBe(false);
  });
});

describe('local persistence', () => {
  it('writes Yjs mutations to storage when started', () => {
    startLocalPersistence();
    startLocalPersistence(); // idempotent
    addSpace({ id: 'x', name: 'X', order: 0, projects: [] });
    expect(chrome.storage.local.set).toHaveBeenCalledWith(expect.objectContaining({ flextab_yjs_state: expect.any(Array) }));
    stopLocalPersistence();
  });

  it('stops writing the Yjs state after stop', () => {
    startLocalPersistence();
    stopLocalPersistence();
    (chrome.storage.local.set as any).mockClear();
    addSpace({ id: 'y', name: 'Y', order: 0, projects: [] });
    expect(chrome.storage.local.set).not.toHaveBeenCalledWith(expect.objectContaining({ flextab_yjs_state: expect.anything() }));
  });

  it('flags dirty when local drifts from the merge-base, and never when signed out', async () => {
    startLocalPersistence();
    // No merge-base yet + a real local tab → local is ahead of the server.
    addSpace(localSpace('a', [{ id: 't1' }]));
    await flush();
    expect(useSyncStore.getState().dirty).toBe(true);

    // Signed out: nothing to sync to, so pending edits aren't "unsynced".
    (useAuthStore.getState as any).mockReturnValue({ isAuthenticated: false });
    addSpace(localSpace('b', [{ id: 't2' }]));
    await flush();
    expect(useSyncStore.getState().dirty).toBe(false);
    stopLocalPersistence();
  });
});
