import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./api', () => ({
  apiFetch: vi.fn(),
  loadTokens: vi.fn(async () => ({ access_token: 't', refresh_token: 'r', expires_at: 0 })),
  getDeviceId: vi.fn(async () => 'dev1'),
  API_BASE_URL: 'http://localhost:3000',
}));
vi.mock('./revision', () => ({ setStoredRevision: vi.fn(async () => {}) }));
vi.mock('~src/store/useAuthStore', () => ({ useAuthStore: { getState: vi.fn(() => ({ isAuthenticated: true })) } }));
vi.mock('~src/store/useSavedSpacesStore', () => ({ ensureDefaultData: vi.fn(), syncActiveSelection: vi.fn() }));

import {
  startSyncEngine, stopSyncEngine, syncNow, resolveConflict,
  startLocalPersistence, stopLocalPersistence,
} from './syncEngine';
import { apiFetch, loadTokens } from './api';
import { useAuthStore } from '~src/store/useAuthStore';
import { ensureDefaultData } from '~src/store/useSavedSpacesStore';
import { useSyncStore } from '~src/store/useSyncStore';
import { useSyncConflict } from '~src/store/useSyncConflict';
import { setSpaces, getSpaces, addSpace, clearState } from '~src/lib/yjsDoc';

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

afterEach(() => { stopSyncEngine(); stopLocalPersistence(); });

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

  it('resolveConflict is a no-op when nothing is pending', () => {
    useSyncConflict.getState().close();
    expect(() => resolveConflict('server')).not.toThrow();
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
});
