/**
 * Window Utilities for Flextab Extension
 */

export type WindowInfo = chrome.windows.Window;

/**
 * Window Query and Retrieval
 */
export class WindowManager {
  static async getAllWindows(populate: boolean = false): Promise<WindowInfo[]> {
    try {
      const windows = await chrome.windows.getAll({ populate });
      return windows;
    } catch (error) {
      console.error('Error getting all windows:', error);
      return [];
    }
  }

  static async getCurrentWindow(populate: boolean = false): Promise<WindowInfo | null> {
    try {
      const window = await chrome.windows.getCurrent({ populate });
      return window;
    } catch (error) {
      console.error('Error getting current window:', error);
      return null;
    }
  }

  static async getWindowById(windowId: number, populate: boolean = false): Promise<WindowInfo | null> {
    try {
      const window = await chrome.windows.get(windowId, { populate });
      return window;
    } catch (error) {
      console.error('Error getting window by ID:', error);
      return null;
    }
  }
}

/**
 * Window Event Management
 */
export class WindowEventManager {
  static onWindowCreated(callback: (window: chrome.windows.Window) => void): void {
    if (chrome.windows?.onCreated) {
      chrome.windows.onCreated.addListener(callback);
    }
  }

  static onWindowRemoved(callback: (windowId: number) => void): void {
    if (chrome.windows?.onRemoved) {
      chrome.windows.onRemoved.addListener(callback);
    }
  }

  static onWindowFocusChanged(callback: (windowId: number) => void): void {
    if (chrome.windows?.onFocusChanged) {
      chrome.windows.onFocusChanged.addListener(callback);
    }
  }

  static removeWindowCreatedListener(callback: (window: chrome.windows.Window) => void): void {
    if (chrome.windows?.onCreated) {
      chrome.windows.onCreated.removeListener(callback);
    }
  }

  static removeWindowRemovedListener(callback: (windowId: number) => void): void {
    if (chrome.windows?.onRemoved) {
      chrome.windows.onRemoved.removeListener(callback);
    }
  }

  static removeWindowFocusChangedListener(callback: (windowId: number) => void): void {
    if (chrome.windows?.onFocusChanged) {
      chrome.windows.onFocusChanged.removeListener(callback);
    }
  }
}
