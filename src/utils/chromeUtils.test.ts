import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TabEventManager } from './tab';
import { WindowManager, WindowEventManager } from './window';

beforeEach(() => vi.clearAllMocks());

describe('TabEventManager', () => {
  it('registers and removes every tab listener', () => {
    const cb = vi.fn();
    TabEventManager.onTabUpdated(cb); TabEventManager.removeTabUpdatedListener(cb);
    TabEventManager.onTabCreated(cb); TabEventManager.removeTabCreatedListener(cb);
    TabEventManager.onTabRemoved(cb); TabEventManager.removeTabRemovedListener(cb);
    TabEventManager.onTabActivated(cb); TabEventManager.removeTabActivatedListener(cb);
    TabEventManager.onTabMoved(cb); TabEventManager.removeTabMovedListener(cb);
    expect(chrome.tabs.onUpdated.addListener).toHaveBeenCalledWith(cb);
    expect(chrome.tabs.onMoved.removeListener).toHaveBeenCalledWith(cb);
  });
});

describe('WindowManager', () => {
  it('getAllWindows returns the windows', async () => {
    (chrome.windows.getAll as any).mockResolvedValue([{ id: 1 }]);
    expect(await WindowManager.getAllWindows(true)).toEqual([{ id: 1 }]);
  });
  it('getAllWindows returns [] on error', async () => {
    (chrome.windows.getAll as any).mockRejectedValue(new Error('x'));
    expect(await WindowManager.getAllWindows()).toEqual([]);
  });
  it('getCurrentWindow returns the window / null on error', async () => {
    (chrome.windows.getCurrent as any).mockResolvedValue({ id: 2 });
    expect(await WindowManager.getCurrentWindow()).toEqual({ id: 2 });
    (chrome.windows.getCurrent as any).mockRejectedValue(new Error('x'));
    expect(await WindowManager.getCurrentWindow()).toBeNull();
  });
  it('getWindowById returns the window / null on error', async () => {
    (chrome.windows.get as any).mockResolvedValue({ id: 3 });
    expect(await WindowManager.getWindowById(3, true)).toEqual({ id: 3 });
    (chrome.windows.get as any).mockRejectedValue(new Error('x'));
    expect(await WindowManager.getWindowById(3)).toBeNull();
  });
});

describe('WindowEventManager', () => {
  it('registers and removes every window listener', () => {
    const cb = vi.fn();
    WindowEventManager.onWindowCreated(cb); WindowEventManager.removeWindowCreatedListener(cb);
    WindowEventManager.onWindowRemoved(cb as any); WindowEventManager.removeWindowRemovedListener(cb as any);
    WindowEventManager.onWindowFocusChanged(cb as any); WindowEventManager.removeWindowFocusChangedListener(cb as any);
    expect(chrome.windows.onCreated.addListener).toHaveBeenCalledWith(cb);
    expect(chrome.windows.onFocusChanged.removeListener).toHaveBeenCalled();
  });
});
