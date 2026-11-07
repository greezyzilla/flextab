import { useSettingsStore } from "~src/store/useSettingsStore";
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const authListeners = vi.hoisted(() => new Set<(state: any, previous: any) => void>());

vi.mock('./api', () => ({
  apiFetch: vi.fn(),
  pushSync: vi.fn(async () => ({ status: "ok", revision: 2 })),
  loadTokens: vi.fn(async () => ({ access_token: 't', refresh_token: 'r', expires_at: 0 })),
  getDeviceId: vi.fn(async () => 'dev1'),
  API_BASE_URL: 'http://localhost:3000',
}));
vi.mock('./revision', () => ({ setStoredRevision: vi.fn(async () => {}), getStoredRevision: vi.fn(async () => 1) }));
vi.mock('~src/store/useAuthStore', () => ({ useAuthStore: { getState: vi.fn(() => ({ isAuthenticated: true })), subscribe: vi.fn((fn) => { authListeners.add(fn); return () => authListeners.delete(fn); }) } }));
vi.mock('~src/store/useSavedSpacesStore', () => ({ ensureDefaultData: vi.fn(), syncActiveSelection: vi.fn() }));

import {
  startSyncEngine, stopSyncEngine, syncNow, pullAndOverwrite, resolveConflict,
  dismissMergeConflicts, startLocalPersistence, stopLocalPersistence,
} from './syncEngine';
import { apiFetch, loadTokens, pushSync } from './api';
import { useAuthStore } from '~src/store/useAuthStore';
import { useSyncStore } from '~src/store/useSyncStore';
import { useSyncConflict } from '~src/store/useSyncConflict';
import { doc, setSpaces, getSpaces, addSpace, clearState } from '~src/lib/yjsDoc';
import { clearMergeBase, getMergeBase, setMergeBase } from './mergeBase';
import { clearConflictPending } from './conflictState';
import { setStoredRevision } from './revision';

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
  useSettingsStore.setState({ autoSync: true });
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
  it.each(['color', 'icon', 'abbreviation', 'title', 'favicon'])('applies a server-only %s edit and skips rewriting the identical next pull', async (field) => {
    setSpaces([localSpace('same', [{ id: 't1' }])]);
    await setMergeBase(getSpaces());
    const server: any = beSpace('same', [{ id: 't1' }]);
    const target = ['title', 'favicon'].includes(field) ? server.projects[0].categories[0].groups[0].tabs[0] : server;
    target[field] = 'updated';
    (apiFetch as any).mockResolvedValue({ spaces: [server], revision: 2 });
    const update = vi.fn();
    doc.on('update', update);
    try {
      await startSyncEngine();
      await flush();
      const local: any = getSpaces()[0];
      const actual = ['title', 'favicon'].includes(field) ? local.projects[0].categories[0].groups[0].tabs[0] : local;
      expect(actual[field]).toBe('updated');
      expect(useSyncStore.getState().dirty).toBe(false);
      expect(update).toHaveBeenCalledTimes(1);
      await startSyncEngine();
      await flush();
      expect(update).toHaveBeenCalledTimes(1);
    } finally {
      doc.off('update', update);
    }
  });

  it('keeps a local-only metadata edit dirty until the server confirms it', async () => {
    setSpaces([localSpace('same', [{ id: 't1' }])]);
    const base = getSpaces();
    await setMergeBase(base);
    const edited = structuredClone(base);
    edited[0].color = 'blue';
    setSpaces(edited);
    (apiFetch as any).mockResolvedValue({ spaces: [beSpace('same', [{ id: 't1' }])], revision: 1 });
    await startSyncEngine();
    await flush();
    expect(getSpaces()[0].color).toBe('blue');
    expect(await getMergeBase()).toEqual(base);
    expect(useSyncStore.getState().dirty).toBe(true);
    expect(useSyncStore.getState().lastSyncedAt).toBeNull();

    (apiFetch as any).mockResolvedValue({ spaces: [{ ...beSpace('same', [{ id: 't1' }]), color: 'blue' }], revision: 2 });
    await startSyncEngine();
    await flush();
    expect((await getMergeBase())?.[0].color).toBe('blue');
    expect(useSyncStore.getState().dirty).toBe(false);
  });

  it('does nothing when unauthenticated', async () => {
    (useAuthStore.getState as any).mockReturnValue({ isAuthenticated: false });
    await startSyncEngine();
    await flush();
    expect(apiFetch).not.toHaveBeenCalled();
    expect(FakeWS.instances).toHaveLength(0);
  });

  it('preserves an empty account and local tree, then connects', async () => {
    (apiFetch as any).mockResolvedValue({ spaces: [], revision: 0 });
    await startSyncEngine();
    await flush();
    expect(apiFetch).toHaveBeenCalledWith('/api/sync');
    expect(getSpaces()).toEqual([]);
    expect(await getMergeBase()).toEqual([]);
    expect(useSyncStore.getState().dirty).toBe(false);
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

  it('keeps the Unsorted marker from the server and drops unknown config', async () => {
    const srv: any = beSpace('srv', [{ id: 't1' }]);
    srv.projects[0].categories[0].groups.push(
      { id: 'u', name: 'Unsorted', order: -1, config: { kind: 'unsorted' }, tabs: [] },
      { id: 'x', name: 'X', order: 1, config: { kind: 'other', extra: 1 }, tabs: [] },
    );
    (apiFetch as any).mockResolvedValue({ spaces: [srv], revision: 2 });
    await startSyncEngine();
    await flush();
    const gs = getSpaces()[0].projects[0].categories[0].groups;
    expect(gs.find(g => g.id === 'u')!.config).toEqual({ kind: 'unsorted' });
    expect(gs.find(g => g.id === 'x')!.config).toBeUndefined();
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

  it('keeps the fresh-login flag until a reconcile acts on it, so a cut-short first run still asks', async () => {
    (apiFetch as any).mockRejectedValueOnce(new Error('offline'));
    await startSyncEngine();
    await flush();
    expect(chrome.storage.local.remove).not.toHaveBeenCalledWith('flextab_fresh_login');
    expect(useSyncConflict.getState().pending).toBe(false);
    stopSyncEngine();
    await startSyncEngine();
    await flush();
    expect(useSyncConflict.getState().pending).toBe(true);
    resolveConflict('merge');
    expect(chrome.storage.local.remove).toHaveBeenCalledWith('flextab_fresh_login');
  });

  it('still applies when storage fails to clear the fresh-login flag', async () => {
    (apiFetch as any).mockResolvedValue({ spaces: [beSpace('server', [{ id: 'S' }])], revision: 1 });
    setSpaces([]);
    (chrome.storage.local.remove as any).mockRejectedValue(new Error('no ctx'));
    await startSyncEngine();
    await flush();
    expect(getSpaces()[0].id).toBe('server');
    expect(chrome.storage.local.remove).toHaveBeenCalledWith('flextab_fresh_login');
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
    expect(chrome.storage.local.remove).toHaveBeenCalledWith([
      'flextab_conflict_pending',
      'flextab_occ_conflict',
    ]);
  });

  it('a plain auto-sync-off pause (no pending conflict) does not set it', () => {
    useSyncStore.getState().reset();
    stopSyncEngine();
    expect(useSyncStore.getState().conflictPending).toBe(false);
  });
});

describe('realtime + lifecycle', () => {
  it('ignores an automatic pull that finishes after auto-sync is turned off', async () => {
    setSpaces([localSpace('before')]);
    let resolve!: (value: any) => void;
    (apiFetch as any).mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const run = startSyncEngine();
    await flush();
    useSettingsStore.getState().setAutoSync(false);
    resolve({ spaces: [beSpace('late', [{ id: 'remote' }])], revision: 9 });
    await run;
    expect(getSpaces().map(s => s.id)).toEqual(['before']);
    expect(FakeWS.instances).toHaveLength(0);
    expect(useSyncStore.getState().status).toBe('paused');
    expect(chrome.storage.local.set).not.toHaveBeenCalledWith({ flextab_sync_hydrated: true });
  });

  it('does not connect a socket if token lookup completes after stopping', async () => {
    let resolve!: (value: any) => void;
    (loadTokens as any).mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    (apiFetch as any).mockResolvedValue({ spaces: [], revision: 1 });
    await startSyncEngine();
    useSettingsStore.getState().setAutoSync(false);
    resolve({ access_token: 'late-token' });
    await flush();
    expect(FakeWS.instances).toHaveLength(0);
    expect(useSyncStore.getState().status).toBe('paused');
  });

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
  it('uploads deletion of the last space while auto-sync is off', async () => {
    useSettingsStore.setState({ autoSync: false });
    const original = localSpace('last', [{ id: 't1' }]);
    setSpaces([original]);
    await setMergeBase(getSpaces());
    setSpaces([]);
    vi.mocked(apiFetch).mockResolvedValue({ spaces: [beSpace('last', [{ id: 't1' }])], revision: 1 });
    vi.mocked(pushSync).mockResolvedValue({ status: 'ok', revision: 2 });
    expect(await syncNow()).toEqual({ status: 'ok' });
    expect(chrome.storage.local.remove).toHaveBeenCalledWith('flextab_limit_notice'); // a landed push ends "Sync paused"
    expect(pushSync).toHaveBeenCalledWith([], 1, expect.any(Function));
    expect(getSpaces()).toEqual([]);
    expect(await getMergeBase()).toEqual([]);
    expect(useSyncStore.getState().dirty).toBe(false);
    expect(FakeWS.instances).toHaveLength(0);
    expect(chrome.storage.local.set).not.toHaveBeenCalledWith({ flextab_sync_hydrated: true });
  });

  it('pulls and pushes once with auto-sync off without opening WS or enabling the worker', async () => {
    useSettingsStore.setState({ autoSync: false });
    setSpaces([localSpace('local', [{ id: 't1' }])]);
    (apiFetch as any).mockResolvedValue({ spaces: [], revision: 1 });
    (pushSync as any).mockResolvedValue({ status: 'ok', revision: 2 });
    expect(await syncNow()).toEqual({ status: 'ok' });
    expect(pushSync).toHaveBeenCalledTimes(1);
    expect(FakeWS.instances).toHaveLength(0);
    expect(chrome.storage.local.set).not.toHaveBeenCalledWith({ flextab_sync_hydrated: true });
    expect(useSettingsStore.getState().autoSync).toBe(false);
    expect(useSyncStore.getState().status).toBe('paused');
    expect(useSyncStore.getState().dirty).toBe(false);
    addSpace(localSpace('later'));
    await flush();
    expect(pushSync).toHaveBeenCalledTimes(1);
    expect(FakeWS.instances).toHaveLength(0);
  });

  it('discards a manual pull from an account that changed while it was in flight', async () => {
    useSettingsStore.setState({ autoSync: false });
    setSpaces([localSpace('local')]);
    let resolve!: (value: any) => void;
    (apiFetch as any).mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const run = syncNow();
    await flush();
    const previous = { isAuthenticated: true, user: { id: 'old' } };
    const next = { isAuthenticated: true, user: { id: 'new' } };
    (useAuthStore.getState as any).mockReturnValue(next);
    authListeners.forEach(fn => fn(next, previous));
    resolve({ spaces: [beSpace('old-account', [{ id: 'private' }])], revision: 9 });
    expect(await run).toEqual({ status: 'signed_out' });
    expect(getSpaces().map(s => s.id)).toEqual(['local']);
    expect(pushSync).not.toHaveBeenCalled();
  });

  it('reports offline without enabling retry/realtime or claiming success', async () => {
    useSettingsStore.setState({ autoSync: false });
    (apiFetch as any).mockRejectedValue(new Error('offline'));
    expect(await syncNow()).toEqual({ status: 'offline' });
    expect(pushSync).not.toHaveBeenCalled();
    expect(FakeWS.instances).toHaveLength(0);
    expect(useSyncStore.getState().lastSyncedAt).toBeNull();
  });

  it.each(['error', 'limit'])('reports a rejected upload as %s and keeps local data dirty', async status => {
    useSettingsStore.setState({ autoSync: false });
    setSpaces([localSpace('local', [{ id: 't1' }])]);
    const local = getSpaces();
    (apiFetch as any).mockResolvedValue({ spaces: [], revision: 1 });
    (pushSync as any).mockResolvedValue({ status, message: 'Quota reached' });
    expect(await syncNow()).toEqual(status === 'limit' ? { status, message: 'Quota reached' } : { status });
    // A limit is kept as the lasting "Sync paused" state (TASK-9).
    if (status === 'limit') expect(chrome.storage.local.set).toHaveBeenCalledWith({ flextab_limit_notice: expect.objectContaining({ message: 'Quota reached' }) });
    expect(getSpaces()).toEqual(local);
    expect(useSyncStore.getState().dirty).toBe(true);
    expect(useSyncStore.getState().lastSyncedAt).toBeNull();
    expect(FakeWS.instances).toHaveLength(0);
  });

  it('reports a fresh-login conflict without uploading guest data', async () => {
    useSettingsStore.setState({ autoSync: false });
    setSpaces([localSpace('guest', [{ id: 'g' }])]);
    (chrome.storage.local.get as any).mockImplementation(async (key: string) => key === 'flextab_fresh_login' ? { flextab_fresh_login: true } : {});
    (apiFetch as any).mockResolvedValue({ spaces: [beSpace('account', [{ id: 'a' }])], revision: 1 });
    expect(await syncNow()).toEqual({ status: 'conflict' });
    expect(pushSync).not.toHaveBeenCalled();
    expect(getSpaces()[0].id).toBe('guest');
    expect(useSyncConflict.getState().pending).toBe(true);
  });

  it('asks before tabs kept from an earlier sign-out go into an empty account (TASK-11)', async () => {
    useSettingsStore.setState({ autoSync: false });
    setSpaces([localSpace('previous-account', [{ id: 'p' }])]);
    const flags: Record<string, boolean> = { flextab_fresh_login: true, flextab_kept_on_signout: true };
    (chrome.storage.local.get as any).mockImplementation(async (key: string) => key in flags ? { [key]: flags[key] } : {});
    (apiFetch as any).mockResolvedValue({ spaces: [], revision: 0 });
    expect(await syncNow()).toEqual({ status: 'conflict' });
    expect(pushSync).not.toHaveBeenCalled();
    expect(getSpaces()[0].id).toBe('previous-account');
    expect(useSyncConflict.getState().pending).toBe(true);
    resolveConflict('server');
    expect(chrome.storage.local.remove).toHaveBeenCalledWith('flextab_kept_on_signout');
  });

  it('asks about kept tabs even when the fresh-login flag was lost (TASK-11)', async () => {
    useSettingsStore.setState({ autoSync: false });
    setSpaces([localSpace('previous-account', [{ id: 'p' }])]);
    (chrome.storage.local.get as any).mockImplementation(async (key: string) => key === 'flextab_kept_on_signout' ? { flextab_kept_on_signout: true } : {});
    (apiFetch as any).mockResolvedValue({ spaces: [], revision: 0 });
    expect(await syncNow()).toEqual({ status: 'conflict' });
    expect(pushSync).not.toHaveBeenCalled();
  });

  it('drops the kept marker when the device has no tabs to ask about', async () => {
    useSettingsStore.setState({ autoSync: false });
    const flags: Record<string, boolean> = { flextab_fresh_login: true, flextab_kept_on_signout: true };
    (chrome.storage.local.get as any).mockImplementation(async (key: string) => key in flags ? { [key]: flags[key] } : {});
    (apiFetch as any).mockResolvedValue({ spaces: [beSpace('account', [{ id: 'a' }])], revision: 1 });
    expect(await syncNow()).toEqual({ status: 'ok' });
    expect(useSyncConflict.getState().pending).toBe(false);
    expect(chrome.storage.local.remove).toHaveBeenCalledWith('flextab_kept_on_signout');
  });

  it('uploads the explicit keep-local choice on the next manual sync instead of asking again', async () => {
    useSettingsStore.setState({ autoSync: false });
    setSpaces([localSpace('guest', [{ id: 'g' }])]);
    const local = getSpaces();
    (chrome.storage.local.get as any).mockImplementation(async (key: string) => key === 'flextab_fresh_login' ? { flextab_fresh_login: true } : {});
    (apiFetch as any).mockResolvedValue({ spaces: [beSpace('account', [{ id: 'a' }])], revision: 1 });
    (pushSync as any).mockResolvedValue({ status: 'ok', revision: 2 });
    expect(await syncNow()).toEqual({ status: 'conflict' });
    resolveConflict('local');
    expect(await syncNow()).toEqual({ status: 'ok' });
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(pushSync).toHaveBeenCalledWith(local, 1, expect.any(Function));
    expect(getSpaces()).toEqual(local);
    expect(FakeWS.instances).toHaveLength(0);
  });

  it('waits for the upload acknowledgement and preserves edits made during it', async () => {
    useSettingsStore.setState({ autoSync: false });
    setSpaces([localSpace('local', [{ id: 't1' }])]);
    const original = getSpaces();
    (apiFetch as any).mockResolvedValue({ spaces: [], revision: 1 });
    let resolve!: (value: any) => void;
    (pushSync as any).mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const run = syncNow();
    expect(syncNow()).toBe(run);
    await flush();
    expect(pushSync).toHaveBeenCalledTimes(1);
    expect(useSyncStore.getState().lastSyncedAt).toBeNull();
    addSpace(localSpace('later'));
    resolve({ status: 'ok', revision: 2 });
    expect(await run).toEqual({ status: 'ok' });
    expect(getSpaces().map(s => s.id)).toEqual(['local', 'later']);
    expect(await getMergeBase()).toEqual(original);
    expect(useSyncStore.getState().dirty).toBe(true);
    expect(pushSync).toHaveBeenCalledTimes(1);
  });

  it('reports signed_out when unauthenticated', async () => {
    (useAuthStore.getState as any).mockReturnValue({ isAuthenticated: false });
    expect(await syncNow()).toEqual({ status: "signed_out" });
  });

  it('re-pulls when authenticated', async () => {
    (apiFetch as any).mockResolvedValue({ spaces: [], revision: 0 });
    expect(await syncNow()).toEqual({ status: "ok" });
    await flush();
    expect(apiFetch).toHaveBeenCalledWith('/api/sync');
  });
});

describe('pullAndOverwrite (post-restore)', () => {
  it('preserves an authoritative empty restore', async () => {
    setSpaces([localSpace('old', [{ id: 't1' }])]);
    vi.mocked(apiFetch).mockResolvedValue({ spaces: [], revision: 5 });
    expect(await pullAndOverwrite()).toBe(true);
    expect(getSpaces()).toEqual([]);
    expect(await getMergeBase()).toEqual([]);
    expect(useSyncStore.getState().dirty).toBe(false);
  });
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

describe('sync session ownership', () => {
  function changeSession(id: string | null) {
    const previous = useAuthStore.getState();
    const next = { isAuthenticated: id !== null, user: id === null ? null : { id } };
    vi.mocked(useAuthStore.getState).mockReturnValue(next as any);
    authListeners.forEach(fn => fn(next, previous));
  }

  function queueLock() {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const request = vi.fn(async (_name: string, work: () => Promise<unknown>) => {
      await gate;
      return work();
    });
    Object.defineProperty(navigator, 'locks', {
      value: { request: (name: string, work: () => Promise<unknown>) => name === 'flextab-structured-sync' ? request(name, work) : work() },
      configurable: true,
    });
    return { release, request };
  }

  beforeEach(async () => {
    changeSession('account-a');
    setSpaces([localSpace('current-workspace', [{ id: 'keep' }])]);
    await setMergeBase(getSpaces());
    vi.mocked(apiFetch).mockResolvedValue({ spaces: [beSpace('private-account-a', [{ id: 'private' }])], revision: 91 });
  });

  afterEach(() => { Reflect.deleteProperty(navigator, 'locks'); });

  it.each(['account-switch', 'logout-login', 'same-account-relogin'])(
    'discards an in-flight restore pull after %s before writing revision or workspace', async transition => {
      const before = getSpaces();
      const base = await getMergeBase();
      let finish!: (value: unknown) => void;
      vi.mocked(apiFetch).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
      const run = pullAndOverwrite();
      await flush();
      if (transition !== 'account-switch') changeSession(null);
      changeSession(transition === 'same-account-relogin' ? 'account-a' : 'account-b');
      useSyncStore.getState().setStatus('error');
      finish({ spaces: [beSpace('private-account-a', [{ id: 'private' }])], revision: 91 });
      expect(await run).toBe(false);
      expect(setStoredRevision).not.toHaveBeenCalled();
      expect(getSpaces()).toEqual(before);
      expect(await getMergeBase()).toEqual(base);
      expect(useSyncStore.getState().lastSyncedAt).toBeNull();
      expect(useSyncStore.getState().status).toBe('error');
      expect(FakeWS.instances).toHaveLength(0);
    },
  );

  it.each(['manual', 'restore'])(
    'does not authorize a queued %s operation under a later account', async kind => {
      const lock = queueLock();
      const before = getSpaces();
      const run = kind === 'manual' ? syncNow() : pullAndOverwrite();
      expect(lock.request).toHaveBeenCalledTimes(1);
      changeSession('account-b');
      useSyncStore.getState().setStatus('error');
      lock.release();
      expect(await run).toEqual(kind === 'manual' ? { status: 'signed_out' } : false);
      expect(apiFetch).not.toHaveBeenCalled();
      expect(pushSync).not.toHaveBeenCalled();
      expect(setStoredRevision).not.toHaveBeenCalled();
      expect(getSpaces()).toEqual(before);
      expect(useSyncStore.getState().status).toBe('error');
    },
  );

  it.each(['manual', 'restore'])(
    'does not authorize a signed-out %s call merely because login completes while queued', async kind => {
      changeSession(null);
      const lock = queueLock();
      const run = kind === 'manual' ? syncNow() : pullAndOverwrite();
      changeSession('account-b');
      lock.release();
      expect(await run).toEqual(kind === 'manual' ? { status: 'signed_out' } : false);
      expect(apiFetch).not.toHaveBeenCalled();
      expect(pushSync).not.toHaveBeenCalled();
    },
  );

  it('discards an automatic reconciliation queued before the account changed', async () => {
    const lock = queueLock();
    const before = getSpaces();
    const run = startSyncEngine();
    await vi.waitFor(() => expect(lock.request).toHaveBeenCalledTimes(1));
    changeSession('account-b');
    lock.release();
    await run;
    expect(apiFetch).not.toHaveBeenCalled();
    expect(setStoredRevision).not.toHaveBeenCalled();
    expect(getSpaces()).toEqual(before);
  });

  it('ignores a stale pull failure without overwriting the new session status', async () => {
    let fail!: (reason: Error) => void;
    vi.mocked(apiFetch).mockReturnValueOnce(new Promise((_resolve, reject) => { fail = reject; }));
    const run = pullAndOverwrite();
    await flush();
    changeSession('account-b');
    useSyncStore.getState().setStatus('error');
    fail(new Error('old request failed'));
    expect(await run).toBe(false);
    expect(useSyncStore.getState().status).toBe('error');
    expect(FakeWS.instances).toHaveLength(0);
  });

  it('continues a queued operation when the same session remains current', async () => {
    const lock = queueLock();
    const run = pullAndOverwrite();
    changeSession('account-a'); // A profile refresh for the same user is not a new session.
    lock.release();
    expect(await run).toBe(true);
    expect(getSpaces()[0].id).toBe('private-account-a');
    expect(setStoredRevision).toHaveBeenCalledWith(91);
  });

  it.each(['manual', 'automatic'])(
    'cancels %s sync when the session changes while reading the fresh-login flag', async kind => {
      let finishFlags!: (value: unknown) => void;
      let readingFlags = false;
      vi.mocked(chrome.storage.local.get).mockImplementation(async (key: any) => {
        if (key !== 'flextab_fresh_login') return {};
        readingFlags = true;
        return new Promise(resolve => { finishFlags = resolve; });
      });
      const run = kind === 'manual' ? syncNow() : startSyncEngine();
      await vi.waitFor(() => expect(readingFlags).toBe(true));
      changeSession('account-b');
      finishFlags({ flextab_fresh_login: true });
      await run;
      expect(apiFetch).not.toHaveBeenCalled();
      expect(pushSync).not.toHaveBeenCalled();
      expect(chrome.storage.local.remove).not.toHaveBeenCalledWith('flextab_fresh_login');
    },
  );

  it('does not apply a restore response if the session changes while revision storage is pending', async () => {
    let finishRevision!: () => void;
    vi.mocked(setStoredRevision).mockReturnValueOnce(new Promise(resolve => { finishRevision = resolve; }));
    const before = getSpaces();
    const base = await getMergeBase();
    const run = pullAndOverwrite();
    await vi.waitFor(() => expect(setStoredRevision).toHaveBeenCalledWith(91));
    changeSession('account-b');
    finishRevision();
    expect(await run).toBe(false);
    expect(getSpaces()).toEqual(before);
    expect(await getMergeBase()).toEqual(base);
  });

  it('does not revive an old queued reconciliation after the automatic engine restarts', async () => {
    const lock = queueLock();
    const oldRun = startSyncEngine();
    await vi.waitFor(() => expect(lock.request).toHaveBeenCalledTimes(1));
    stopSyncEngine();
    const newRun = startSyncEngine();
    await vi.waitFor(() => expect(lock.request).toHaveBeenCalledTimes(2));
    lock.release();
    await Promise.all([oldRun, newRun]);
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(setStoredRevision).toHaveBeenCalledTimes(1);
  });
});

describe('local persistence', () => {
  it('writes Yjs mutations to storage when started', () => {
    startLocalPersistence();
    startLocalPersistence(); // idempotent
    addSpace({ id: 'x', name: 'X', order: 0, projects: [] });
    expect(chrome.storage.local.set).toHaveBeenCalledWith(expect.objectContaining({ flextab_yjs_state: expect.objectContaining({ version: 1, origin: "page", data: expect.any(Array) }) }));
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
