import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock('./api', () => ({ apiGetSettings: api.get, apiPutSettings: api.put }));
vi.mock('~src/store/useAuthStore', async () => {
  const { create } = await import('zustand');
  return { useAuthStore: create(() => ({ isAuthenticated: true, user: null })) };
});

const initial = {
  groupLayout: 'list' as const, gridColumns: 2, density: 'comfortable' as const,
  hue: 214, intensity: 100, titleCut: 50, linkCut: 50, linkCutScope: 'all' as const, tabPreview: 'hover' as const, iconWeight: 'regular' as const, autoSync: true,
};
let store: typeof import('~src/store/useSettingsStore').useSettingsStore;
let sync: typeof import('./settingsSync');
let auth: typeof import('~src/store/useAuthStore').useAuthStore;
const user = (id: string) => ({ id, email: `${id}@example.invalid`, name: id, avatar: '', provider: 'email', has_password: true });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  ({ useAuthStore: auth } = await import('~src/store/useAuthStore'));
  auth.setState({ isAuthenticated: true, user: user('A') });
  api.get.mockReset().mockResolvedValue({ ...initial });
  api.put.mockReset().mockResolvedValue(undefined);
  ({ useSettingsStore: store } = await import('~src/store/useSettingsStore'));
  await store.persist.rehydrate();
  store.setState(initial);
  sync = await import('./settingsSync');
});

afterEach(() => {
  sync.stopSettingsSync();
  vi.clearAllTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('account settings sync with the production settings store', () => {
  it('keeps guest settings local on startup and subsequent edits', async () => {
    auth.setState({ isAuthenticated: false, user: null });
    await sync.pullSettings();
    sync.startSettingsSync();
    store.getState().setHue(30);
    await vi.advanceTimersByTimeAsync(6000);
    expect(store.getState().hue).toBe(30);
    expect(api.get).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();
  });

  it.each([null, {}])('seeds an empty account (%j) with only account settings', async remote => {
    api.get.mockResolvedValue(remote);
    store.getState().setRadius(12);
    await sync.pullSettings();
    expect(api.put).toHaveBeenCalledExactlyOnceWith(initial);
  });

  it('adopts known remote fields and preserves device-only preferences', async () => {
    store.getState().setRadius(12);
    api.get.mockResolvedValue({ hue: 30, autoSync: false, radius: 0, unknownField: 'ignored' });
    await sync.pullSettings();
    expect(store.getState()).toMatchObject({ ...initial, hue: 30, autoSync: false, radius: 12 });
    expect(store.getState()).not.toHaveProperty('unknownField');
    expect(api.put).not.toHaveBeenCalled();
  });

  it('preserves local settings when the initial pull fails', async () => {
    api.get.mockRejectedValue(new Error('offline'));
    await sync.pullSettings();
    expect(store.getState()).toMatchObject(initial);
    expect(api.put).not.toHaveBeenCalled();
  });

  it('debounces a burst once and preserves independent edits from another device', async () => {
    await sync.pullSettings();
    api.get.mockClear().mockResolvedValue({ ...initial, density: 'compact' });
    sync.startSettingsSync();
    sync.startSettingsSync();
    store.getState().setHue(20);
    await vi.advanceTimersByTimeAsync(400);
    store.getState().setHue(30);
    await vi.advanceTimersByTimeAsync(799);
    expect(api.put).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.put).toHaveBeenCalledExactlyOnceWith({ ...initial, hue: 30, density: 'compact' });
    expect(store.getState()).toMatchObject({ hue: 30, density: 'compact' });
    store.getState().setRadius(12);
    await vi.advanceTimersByTimeAsync(6000);
    expect(api.put).toHaveBeenCalledTimes(1); // adoption/device-only edits do not echo
  });

  it.each(['get', 'put'] as const)('retries a failed %s without dropping the pending change', async failed => {
    await sync.pullSettings();
    api.get.mockClear();
    api[failed].mockRejectedValueOnce(new Error('temporary failure'));
    sync.startSettingsSync();
    store.getState().setHue(30);
    await vi.advanceTimersByTimeAsync(800);
    const writesAfterFailure = api.put.mock.calls.length;
    await vi.advanceTimersByTimeAsync(4999);
    expect(api.put).toHaveBeenCalledTimes(writesAfterFailure);
    await vi.advanceTimersByTimeAsync(1);
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(api.put).toHaveBeenLastCalledWith({ ...initial, hue: 30 });
    await vi.advanceTimersByTimeAsync(5000);
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('pushes local values when the account has no settings at push time', async () => {
    api.get.mockResolvedValue({});
    sync.startSettingsSync();
    store.getState().setAutoSync(false);
    await vi.advanceTimersByTimeAsync(800);
    expect(api.put).toHaveBeenCalledExactlyOnceWith({ ...initial, autoSync: false });
  });

  it('does not start a queued push after signing out', async () => {
    sync.startSettingsSync();
    store.getState().setHue(30);
    auth.setState({ isAuthenticated: false, user: null });
    await vi.advanceTimersByTimeAsync(800);
    expect(api.get).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();
  });

  it('stops pending debounce/retry timers and detaches the subscription', async () => {
    sync.startSettingsSync();
    store.getState().setHue(30);
    sync.stopSettingsSync();
    await vi.advanceTimersByTimeAsync(800);
    expect(api.get).not.toHaveBeenCalled();

    sync.startSettingsSync();
    api.get.mockRejectedValueOnce(new Error('offline'));
    store.getState().setHue(40);
    await vi.advanceTimersByTimeAsync(800);
    expect(api.get).toHaveBeenCalledTimes(1);
    sync.stopSettingsSync();
    sync.stopSettingsSync();
    store.getState().setHue(50);
    await vi.advanceTimersByTimeAsync(6000);
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.put).not.toHaveBeenCalled();
  });
});


describe('settings session isolation', () => {
  it.each([{}, { hue: 10, autoSync: false }])('drops a delayed pull from A after switching to B (%j)', async remote => {
    const pending = deferred<Record<string, unknown>>();
    api.get.mockReturnValueOnce(pending.promise);
    const pull = sync.pullSettings();
    await vi.advanceTimersByTimeAsync(0);
    auth.setState({ user: user('B') });
    store.setState({ hue: 280, autoSync: true });
    pending.resolve(remote);
    await pull;
    expect(store.getState()).toMatchObject({ hue: 280, autoSync: true });
    expect(api.put).not.toHaveBeenCalled();
  });

  it('does not send A settings when a push GET completes on B', async () => {
    await sync.pullSettings();
    const pending = deferred<Record<string, unknown>>();
    api.get.mockReturnValueOnce(pending.promise);
    sync.startSettingsSync();
    store.getState().setHue(30);
    await vi.advanceTimersByTimeAsync(800);
    auth.setState({ user: user('B') });
    pending.resolve({ ...initial, density: 'compact' });
    await vi.advanceTimersByTimeAsync(0);
    expect(api.put).not.toHaveBeenCalled();
  });

  it('does not apply an old push acknowledgement to B', async () => {
    await sync.pullSettings();
    const pending = deferred<void>();
    api.get.mockResolvedValue({ ...initial, density: 'compact' });
    api.put.mockReturnValueOnce(pending.promise);
    sync.startSettingsSync();
    store.getState().setHue(30);
    await vi.advanceTimersByTimeAsync(800);
    expect(api.put).toHaveBeenCalledTimes(1);
    auth.setState({ user: user('B') });
    store.setState({ hue: 280, density: 'cozy' });
    pending.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState()).toMatchObject({ hue: 280, density: 'cozy' });
  });

  it('invalidates a pull across logout/relogin of the same account', async () => {
    const pending = deferred<Record<string, unknown>>();
    api.get.mockReturnValueOnce(pending.promise);
    const pull = sync.pullSettings();
    await vi.advanceTimersByTimeAsync(0);
    auth.setState({ isAuthenticated: false, user: null });
    auth.setState({ isAuthenticated: true, user: user('A') });
    pending.resolve({ hue: 10 });
    await pull;
    expect(store.getState().hue).toBe(initial.hue);
  });

  it('invalidates a pending pull when settings sync stops', async () => {
    const pending = deferred<Record<string, unknown>>();
    api.get.mockReturnValueOnce(pending.promise);
    const pull = sync.pullSettings();
    await vi.advanceTimersByTimeAsync(0);
    sync.stopSettingsSync();
    pending.resolve({ hue: 10 });
    await pull;
    expect(store.getState().hue).toBe(initial.hue);
  });
});


describe('queued settings work and session bookkeeping', () => {
  it.each(['pull', 'push'] as const)('rejects a %s queued behind the login/logout lock after an account switch', async kind => {
    const queue: (() => Promise<void>)[] = [];
    const request = vi.fn((_name: string, work: () => Promise<void>) => new Promise<void>((resolve, reject) => {
      queue.push(async () => { try { await work(); resolve(); } catch (error) { reject(error); } });
    }));
    vi.stubGlobal('navigator', { locks: { request } });
    let pull: Promise<void> | undefined;
    if (kind === 'pull') pull = sync.pullSettings();
    else {
      sync.startSettingsSync();
      store.getState().setHue(30);
      await vi.advanceTimersByTimeAsync(800);
    }
    await vi.advanceTimersByTimeAsync(0);
    expect(request).toHaveBeenCalledWith('flextab-structured-sync', expect.any(Function));
    expect(queue).toHaveLength(1);
    auth.setState({ user: user('B') });
    await queue.shift()!();
    await pull;
    expect(api.get).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();
  });

  it('waits for account identity before loading or subscribing', async () => {
    auth.setState({ user: null });
    await sync.pullSettings();
    sync.startSettingsSync();
    store.getState().setHue(30);
    await vi.advanceTimersByTimeAsync(800);
    expect(api.get).not.toHaveBeenCalled();
    auth.setState({ user: user('A') });
    await sync.pullSettings();
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('accepts a response after a profile refresh with the same user ID', async () => {
    const pending = deferred<Record<string, unknown>>();
    api.get.mockReturnValueOnce(pending.promise);
    const pull = sync.pullSettings();
    auth.setState({ user: { ...user('A'), name: 'Updated name' } });
    pending.resolve({ hue: 30 });
    await pull;
    expect(store.getState().hue).toBe(30);
  });

  it('does not let an old seed acknowledgement replace the new account merge base', async () => {
    const pending = deferred<void>();
    api.get.mockResolvedValueOnce({});
    api.put.mockReturnValueOnce(pending.promise);
    const pull = sync.pullSettings();
    await vi.advanceTimersByTimeAsync(0);
    expect(api.put).toHaveBeenCalledTimes(1);
    auth.setState({ user: user('B') });
    api.get.mockResolvedValueOnce({ ...initial, hue: 280 });
    const nextPull = sync.pullSettings();
    pending.resolve();
    await pull;
    await nextPull;
    sync.startSettingsSync();
    api.get.mockResolvedValue({ ...initial, hue: 300 });
    store.getState().setGridColumns(4);
    await vi.advanceTimersByTimeAsync(800);
    expect(api.put).toHaveBeenLastCalledWith({ ...initial, hue: 300, gridColumns: 4 });
  });

  it('does not retry a failed old push after another account starts syncing', async () => {
    const pending = deferred<Record<string, unknown>>();
    api.get.mockReturnValueOnce(pending.promise);
    sync.startSettingsSync();
    store.getState().setHue(30);
    await vi.advanceTimersByTimeAsync(800);
    auth.setState({ user: user('B') });
    sync.startSettingsSync();
    pending.reject(new Error('old request failed'));
    await vi.advanceTimersByTimeAsync(6000);
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.put).not.toHaveBeenCalled();
  });

  it('cancels a scheduled retry on account switch', async () => {
    api.get.mockRejectedValueOnce(new Error('offline'));
    sync.startSettingsSync();
    store.getState().setHue(30);
    await vi.advanceTimersByTimeAsync(800);
    auth.setState({ user: user('B') });
    sync.startSettingsSync();
    await vi.advanceTimersByTimeAsync(6000);
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('drops a timer callback already dispatched before stop/restart', async () => {
    const timers = vi.spyOn(globalThis, 'setTimeout');
    sync.startSettingsSync();
    store.getState().setHue(30);
    const callback = timers.mock.calls.find(([, delay]) => delay === 800)![0] as () => void;
    sync.stopSettingsSync();
    sync.startSettingsSync();
    callback();
    await vi.advanceTimersByTimeAsync(0);
    expect(api.get).not.toHaveBeenCalled();
  });

  it('ignores a non-account settings response without replacing local preferences', async () => {
    api.get.mockResolvedValue({ radius: 12 });
    await sync.pullSettings();
    expect(store.getState()).toMatchObject(initial);
  });

  it('coalesces retry timers after queued failures in the no-Web-Locks fallback', async () => {
    const first = deferred<Record<string, unknown>>();
    const second = deferred<Record<string, unknown>>();
    api.get.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    sync.startSettingsSync();
    store.getState().setHue(30);
    await vi.advanceTimersByTimeAsync(800);
    store.getState().setHue(40);
    await vi.advanceTimersByTimeAsync(800);
    expect(api.get).toHaveBeenCalledTimes(1);
    first.reject(new Error('offline'));
    await vi.advanceTimersByTimeAsync(0);
    expect(api.get).toHaveBeenCalledTimes(2);
    second.reject(new Error('offline'));
    await vi.advanceTimersByTimeAsync(5000);
    expect(api.get).toHaveBeenCalledTimes(3);
    expect(api.put).toHaveBeenCalledExactlyOnceWith({ ...initial, hue: 40 });
  });
});

describe('settings edits during network requests', () => {
  it('preserves edits during startup pull and sends them without losing remote-only fields', async () => {
    const pending = deferred<Record<string, unknown>>();
    api.get.mockReturnValueOnce(pending.promise);
    const pull = sync.pullSettings();
    sync.startSettingsSync();
    await vi.advanceTimersByTimeAsync(0);
    store.getState().setAutoSync(false);
    pending.resolve({ ...initial, hue: 300 });
    await pull;
    expect(store.getState()).toMatchObject({ autoSync: false, hue: 300 });
    api.get.mockResolvedValue({ ...initial, hue: 300 });
    await vi.advanceTimersByTimeAsync(800);
    expect(api.put).toHaveBeenLastCalledWith({ ...initial, autoSync: false, hue: 300 });
  });

  it('includes edits made during push GET in the outgoing PUT', async () => {
    await sync.pullSettings();
    const pending = deferred<Record<string, unknown>>();
    api.get.mockReturnValueOnce(pending.promise);
    sync.startSettingsSync();
    store.getState().setHue(30);
    await vi.advanceTimersByTimeAsync(800);
    store.getState().setAutoSync(false);
    pending.resolve({ ...initial, density: 'compact' });
    await vi.advanceTimersByTimeAsync(0);
    expect(api.put).toHaveBeenLastCalledWith({ ...initial, hue: 30, autoSync: false, density: 'compact' });
    expect(store.getState()).toMatchObject({ autoSync: false, density: 'compact' });
  });

  it.each([false, true])('preserves edits during PUT and eventually sends them (remote change=%s)', async remoteChange => {
    await sync.pullSettings();
    let server = { ...initial, density: remoteChange ? 'compact' as const : initial.density };
    api.get.mockImplementation(async () => ({ ...server }));
    const pending = deferred<void>();
    api.put.mockImplementationOnce(async value => { await pending.promise; server = { ...value }; });
    api.put.mockImplementation(async value => { server = { ...value }; });
    sync.startSettingsSync();
    store.getState().setHue(30);
    await vi.advanceTimersByTimeAsync(800);
    store.getState().setAutoSync(false);
    store.getState().setHue(40);
    pending.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState()).toMatchObject({ hue: 40, autoSync: false, density: server.density });
    await vi.advanceTimersByTimeAsync(6000);
    expect(server).toMatchObject({ hue: 40, autoSync: false });
    expect(api.put).toHaveBeenCalledTimes(2);
  });

  it('keeps a local revert during PUT instead of reapplying the sent value', async () => {
    await sync.pullSettings();
    const pending = deferred<void>();
    api.get.mockResolvedValue({ ...initial, density: 'compact' });
    api.put.mockReturnValueOnce(pending.promise);
    sync.startSettingsSync();
    store.getState().setHue(30);
    await vi.advanceTimersByTimeAsync(800);
    store.getState().setHue(initial.hue);
    pending.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState()).toMatchObject({ hue: initial.hue, density: 'compact' });
    await vi.advanceTimersByTimeAsync(800);
    expect(api.put).toHaveBeenLastCalledWith({ ...initial, density: 'compact' });
  });
});

describe('settings request serialization and recovery', () => {
  it('serializes pushes without Web Locks while the earlier PUT is unresolved', async () => {
    await sync.pullSettings();
    let server = { ...initial, density: 'compact' as const };
    api.get.mockClear().mockImplementation(async () => ({ ...server }));
    const pending = deferred<void>();
    api.put.mockImplementationOnce(async value => { await pending.promise; server = { ...value }; });
    api.put.mockImplementation(async value => { server = { ...value }; });
    sync.startSettingsSync();
    store.getState().setHue(30);
    await vi.advanceTimersByTimeAsync(800);
    store.getState().setAutoSync(false);
    store.getState().setHue(40);
    await vi.advanceTimersByTimeAsync(1600);
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.put).toHaveBeenCalledTimes(1);
    pending.resolve();
    await vi.advanceTimersByTimeAsync(6000);
    expect(api.put).toHaveBeenCalledTimes(2);
    expect(server).toEqual({ ...initial, density: 'compact', hue: 40, autoSync: false });
    expect(store.getState()).toMatchObject(server);
  });

  it('keeps changes made during first-account seeding dirty until their own acknowledgement', async () => {
    let server: Record<string, unknown> = {};
    api.get.mockImplementation(async () => ({ ...server }));
    const pending = deferred<void>();
    api.put.mockImplementationOnce(async value => { await pending.promise; server = { ...value }; });
    api.put.mockImplementation(async value => { server = { ...value }; });
    const pull = sync.pullSettings();
    sync.startSettingsSync();
    await vi.advanceTimersByTimeAsync(0);
    store.getState().setAutoSync(false);
    await vi.advanceTimersByTimeAsync(800);
    expect(api.put).toHaveBeenCalledTimes(1);
    pending.resolve();
    await pull;
    expect(store.getState().autoSync).toBe(false);
    await vi.advanceTimersByTimeAsync(6000);
    expect(server.autoSync).toBe(false);
    expect(api.put).toHaveBeenCalledTimes(2);
  });

  it('preserves edits made while a startup pull waits for the shared lock', async () => {
    let release!: () => Promise<void>;
    vi.stubGlobal('navigator', { locks: {
      request: vi.fn((_name: string, work: () => Promise<void>) => new Promise<void>((resolve, reject) => {
        release = async () => { try { await work(); resolve(); } catch (error) { reject(error); } };
      })),
    } });
    api.get.mockResolvedValue({ ...initial, hue: 300 });
    const pull = sync.pullSettings();
    await vi.advanceTimersByTimeAsync(0);
    store.getState().setAutoSync(false);
    await release();
    await pull;
    expect(store.getState()).toMatchObject({ autoSync: false, hue: 300 });
    expect(api.put).not.toHaveBeenCalled(); // no subscription was started
  });

  it.each([false, true])('preserves a local revert after a failed PUT (committed=%s)', async committed => {
    await sync.pullSettings();
    let server = { ...initial };
    api.get.mockImplementation(async () => ({ ...server }));
    const pending = deferred<void>();
    api.put.mockImplementationOnce(async value => {
      if (committed) server = { ...value };
      await pending.promise;
    });
    api.put.mockImplementation(async value => { server = { ...value }; });
    sync.startSettingsSync();
    store.getState().setHue(30);
    await vi.advanceTimersByTimeAsync(800);
    store.getState().setHue(initial.hue);
    pending.reject(new Error('response lost after server commit'));
    await vi.advanceTimersByTimeAsync(6000);
    expect(server.hue).toBe(initial.hue);
    expect(store.getState().hue).toBe(initial.hue);
  });

  it('does not echo an edit already included after a slow GET', async () => {
    await sync.pullSettings();
    const pending = deferred<Record<string, unknown>>();
    api.get.mockReturnValueOnce(pending.promise);
    sync.startSettingsSync();
    store.getState().setHue(30);
    await vi.advanceTimersByTimeAsync(800);
    store.getState().setAutoSync(false);
    pending.resolve(initial);
    await vi.advanceTimersByTimeAsync(6000);
    expect(api.put).toHaveBeenCalledExactlyOnceWith({ ...initial, hue: 30, autoSync: false });
  });
});

describe('settings changes survive a reload before they are pushed', () => {
  let disk: Record<string, unknown>;

  beforeEach(() => {
    disk = {};
    vi.mocked(chrome.storage.local.get).mockImplementation((async (key: string) => (key in disk ? { [key]: structuredClone(disk[key]) } : {})) as never);
    vi.mocked(chrome.storage.local.set).mockImplementation((async (values: Record<string, unknown>) => { Object.assign(disk, structuredClone(values)); }) as never);
  });

  afterEach(() => {
    vi.mocked(chrome.storage.local.get).mockReset().mockImplementation((async () => ({})) as never);
    vi.mocked(chrome.storage.local.set).mockReset().mockImplementation((async () => {}) as never);
  });

  /** A fresh page on the same disk: what an update reload, a closed tab or a crash leaves. */
  async function reload() {
    sync.stopSettingsSync();
    vi.resetModules();
    ({ useAuthStore: auth } = await import('~src/store/useAuthStore'));
    auth.setState({ isAuthenticated: true, user: user('A') });
    ({ useSettingsStore: store } = await import('~src/store/useSettingsStore'));
    await store.persist.rehydrate();
    sync = await import('./settingsSync');
  }

  /** As newtab/index.tsx starts it: pull, then subscribe, without waiting in between. */
  async function signedInPage() {
    const pulled = sync.pullSettings();
    sync.startSettingsSync();
    await pulled;
    await sync.flushSettingsSync();
  }

  it('keeps a change made inside the push debounce and pushes it after the reload', async () => {
    await signedInPage();
    store.getState().setHue(30);
    await vi.advanceTimersByTimeAsync(100); // reloaded before the 800ms push
    expect(api.put).not.toHaveBeenCalled();
    await reload();
    api.put.mockClear();
    await signedInPage();
    expect(store.getState().hue).toBe(30);
    await vi.advanceTimersByTimeAsync(800);
    expect(api.put).toHaveBeenLastCalledWith({ ...initial, hue: 30 });
  });

  it('keeps a change whose push failed offline', async () => {
    await signedInPage();
    api.get.mockRejectedValueOnce(new Error('offline'));
    store.getState().setHue(30);
    await vi.advanceTimersByTimeAsync(800);
    await reload();
    api.put.mockClear();
    await signedInPage();
    expect(store.getState().hue).toBe(30);
    await vi.advanceTimersByTimeAsync(800);
    expect(api.put).toHaveBeenLastCalledWith({ ...initial, hue: 30 });
  });

  it('still takes a change another device made to a field this device did not touch', async () => {
    await signedInPage();
    store.getState().setHue(30);
    await reload();
    api.get.mockResolvedValue({ ...initial, density: 'compact' });
    await signedInPage();
    expect(store.getState()).toMatchObject({ hue: 30, density: 'compact' });
  });

  it('ignores a merge base stored for another account', async () => {
    await signedInPage();
    store.getState().setHue(30);
    await reload();
    auth.setState({ isAuthenticated: true, user: user('B') });
    api.get.mockResolvedValue({ ...initial, hue: 99 });
    await signedInPage();
    expect(store.getState().hue).toBe(99);
  });
});

describe('the stored settings merge base when it cannot be used', () => {
  it.each([
    ['unreadable storage', () => { throw new Error('disk') }],
    ['a record without a base', () => ({ [sync.SETTINGS_SYNC_STATE_KEY]: { userId: 'A', base: null, unconfirmed: [] } })],
  ])('falls back to the server values on %s', async (_, read) => {
    vi.mocked(chrome.storage.local.get).mockImplementation((async () => read()) as never);
    store.getState().setHue(30);
    api.get.mockResolvedValue({ ...initial, hue: 99 });
    await sync.pullSettings();
    expect(store.getState().hue).toBe(99);
    vi.mocked(chrome.storage.local.get).mockReset().mockImplementation((async () => ({})) as never);
  });

  it('keeps an unconfirmed field and lets the server fill a field the stored base predates', async () => {
    const { titleCut: _omitted, ...olderBase } = { ...initial };
    vi.mocked(chrome.storage.local.get).mockImplementation((async () => ({
      [sync.SETTINGS_SYNC_STATE_KEY]: { userId: 'A', base: { ...olderBase, unknown: 1 }, unconfirmed: ['hue', 'notASetting'] },
    })) as never);
    api.get.mockResolvedValue({ ...initial, hue: initial.hue, titleCut: 70 });
    store.setState({ hue: initial.hue }); // a revert that was never confirmed still counts
    await sync.pullSettings();
    expect(store.getState()).toMatchObject({ hue: initial.hue, titleCut: 70 });
    vi.mocked(chrome.storage.local.get).mockReset().mockImplementation((async () => ({})) as never);
  });

  it('reads a record whose unconfirmed list is missing', async () => {
    vi.mocked(chrome.storage.local.get).mockImplementation((async () => ({
      [sync.SETTINGS_SYNC_STATE_KEY]: { userId: 'A', base: { ...initial } },
    })) as never);
    store.getState().setHue(30);
    api.get.mockResolvedValue({ ...initial, density: 'compact' });
    await sync.pullSettings();
    expect(store.getState()).toMatchObject({ hue: 30, density: 'compact' });
    vi.mocked(chrome.storage.local.get).mockReset().mockImplementation((async () => ({})) as never);
  });

  it('drops a pull whose account switched while the stored base was read', async () => {
    vi.mocked(chrome.storage.local.get).mockImplementation((async () => {
      auth.setState({ isAuthenticated: true, user: user('B') });
      return {};
    }) as never);
    await sync.pullSettings();
    expect(api.get).not.toHaveBeenCalled();
    vi.mocked(chrome.storage.local.get).mockReset().mockImplementation((async () => ({})) as never);
  });

  it('pulls without a stored base while the account identity is still loading', async () => {
    auth.setState({ isAuthenticated: true, user: null });
    await sync.pullSettings();
    expect(api.get).not.toHaveBeenCalled();
  });
});
