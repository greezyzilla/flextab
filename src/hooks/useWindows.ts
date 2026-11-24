import { useState, useEffect, useCallback } from 'react';
import {
  WindowManager,
  WindowEventManager,
  type WindowInfo,
  TabEventManager
} from '../utils';

export interface WindowHookState {
  windows: WindowInfo[];
  loading: boolean;
  error: string | null;
}

export function useWindows(options: {
  populate?: boolean;
  autoRefresh?: boolean;
  refreshInterval?: number;
} = {}) {
  const { populate = false, autoRefresh = false, refreshInterval = 5000 } = options;

  const [state, setState] = useState<WindowHookState>({
    windows: [],
    loading: true,
    error: null
  });

  const fetchWindows = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      const windows = await WindowManager.getAllWindows(populate);
      if (populate) {
        windows.forEach((window, i) => {
          if (window.tabs?.length) {
            // A tab that has not committed yet has only a pendingUrl: still listed.
            windows[i].tabs = window.tabs.filter(tab => !!(tab.url || tab.pendingUrl));
          }
        });
      }
      setState({ windows, loading: false, error: null });
    } catch (error) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch windows'
      }));
    }
  }, [populate]);

  const refresh = useCallback(() => {
    fetchWindows();
  }, [fetchWindows]);

  useEffect(() => {
    fetchWindows();
  }, [fetchWindows]);

  // Auto refresh
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchWindows, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchWindows]);

  // Window + tab event listeners for real-time updates
  useEffect(() => {
    const handler = () => fetchWindows();

    WindowEventManager.onWindowCreated(handler);
    WindowEventManager.onWindowRemoved(handler);
    WindowEventManager.onWindowFocusChanged(handler);
    TabEventManager.onTabCreated(handler);
    TabEventManager.onTabRemoved(handler);
    TabEventManager.onTabUpdated(handler);
    // A tab moved within its window, or into another one.
    TabEventManager.onTabMoved(handler);
    chrome.tabs.onAttached?.addListener(handler);

    return () => {
      WindowEventManager.removeWindowCreatedListener(handler);
      WindowEventManager.removeWindowRemovedListener(handler);
      WindowEventManager.removeWindowFocusChangedListener(handler);
      TabEventManager.removeTabCreatedListener(handler);
      TabEventManager.removeTabRemovedListener(handler);
      TabEventManager.removeTabUpdatedListener(handler);
      TabEventManager.removeTabMovedListener(handler);
      chrome.tabs.onAttached?.removeListener(handler);
    };
  }, [fetchWindows]);

  return { ...state, refresh, fetchWindows };
}
