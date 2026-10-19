import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), authenticated: true }));
vi.mock('./api', () => ({ apiGetSettings: api.get, apiPutSettings: api.put }));
vi.mock('~src/store/useAuthStore', () => ({
  useAuthStore: { getState: () => ({ isAuthenticated: api.authenticated }) },
}));

const initial = {
  groupLayout: 'list' as const, gridColumns: 2, density: 'comfortable' as const,
  hue: 214, intensity: 100, autoSync: true,
};
let store: typeof import('~src/store/useSettingsStore').useSettingsStore;
let sync: typeof import('./settingsSync');

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  api.authenticated = true;
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
  vi.useRealTimers();
});

describe('account settings sync with the production settings store', () => {
  it('keeps guest settings local on startup and subsequent edits', async () => {
    api.authenticated = false;
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
    api.authenticated = false;
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
