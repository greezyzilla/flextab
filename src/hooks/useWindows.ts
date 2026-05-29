import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  WindowManager,
  WindowCreator,
  WindowManipulator,
  WindowUtils,
  WindowEventManager,
  type WindowInfo,
  TabEventManager
} from '../utils';

export interface WindowHookState {
  windows: WindowInfo[];
  loading: boolean;
  error: string | null;
}

export interface CurrentWindowHookState {
  currentWindow: WindowInfo | null;
  loading: boolean;
  error: string | null;
}

export interface WindowTabsState {
  tabs: chrome.tabs.Tab[];
  loading: boolean;
  error: string | null;
}

export interface WindowSummaryState {
  total: number;
  normal: number;
  incognito: number;
  popup: number;
  totalTabs: number;
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
            windows[i].tabs = window.tabs.filter(tab => !!tab.url);
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

    return () => {
      WindowEventManager.removeWindowCreatedListener(handler);
      WindowEventManager.removeWindowRemovedListener(handler);
      WindowEventManager.removeWindowFocusChangedListener(handler);
      TabEventManager.removeTabCreatedListener(handler);
      TabEventManager.removeTabRemovedListener(handler);
      TabEventManager.removeTabUpdatedListener(handler);
    };
  }, [fetchWindows]);

  return { ...state, refresh, fetchWindows };
}

export function useCurrentWindow(options: {
  populate?: boolean;
  autoRefresh?: boolean;
  refreshInterval?: number;
} = {}) {
  const { populate = false, autoRefresh = false, refreshInterval = 3000 } = options;

  const [state, setState] = useState<CurrentWindowHookState>({
    currentWindow: null,
    loading: true,
    error: null
  });

  const fetchCurrentWindow = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      const currentWindow = await WindowManager.getCurrentWindow(populate);
      if (currentWindow?.tabs?.length) {
        currentWindow.tabs = currentWindow.tabs.filter(tab => !!tab.url);
      }
      setState({ currentWindow, loading: false, error: null });
    } catch (error) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch current window'
      }));
    }
  }, [populate]);

  const refresh = useCallback(() => {
    fetchCurrentWindow();
  }, [fetchCurrentWindow]);

  useEffect(() => {
    fetchCurrentWindow();
  }, [fetchCurrentWindow]);

  // Auto refresh
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchCurrentWindow, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchCurrentWindow]);

  // Event listeners with proper cleanup
  useEffect(() => {
    const handleFocusChanged = () => fetchCurrentWindow();
    const handleTabActivated = () => fetchCurrentWindow();

    WindowEventManager.onWindowFocusChanged(handleFocusChanged);
    TabEventManager.onTabActivated(handleTabActivated);

    return () => {
      WindowEventManager.removeWindowFocusChangedListener(handleFocusChanged);
      TabEventManager.removeTabActivatedListener(handleTabActivated);
    };
  }, [fetchCurrentWindow]);

  return { ...state, refresh, fetchCurrentWindow };
}

export function useWindowTabs(windowId: number | null) {
  const [state, setState] = useState<WindowTabsState>({
    tabs: [],
    loading: true,
    error: null
  });

  const fetchWindowTabs = useCallback(async () => {
    if (!windowId) {
      setState({ tabs: [], loading: false, error: null });
      return;
    }

    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      const window = await WindowManager.getWindowById(windowId, true);
      const tabs = window?.tabs?.filter(tab => !!tab.url) || [];
      setState({ tabs, loading: false, error: null });
    } catch (error) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch window tabs'
      }));
    }
  }, [windowId]);

  const refresh = useCallback(() => {
    fetchWindowTabs();
  }, [fetchWindowTabs]);

  useEffect(() => {
    fetchWindowTabs();
  }, [fetchWindowTabs]);

  return { ...state, refresh, fetchWindowTabs };
}

export function useWindowSummary(options: {
  autoRefresh?: boolean;
  refreshInterval?: number;
} = {}) {
  const { autoRefresh = false, refreshInterval = 5000 } = options;

  const [state, setState] = useState<WindowSummaryState>({
    total: 0,
    normal: 0,
    incognito: 0,
    popup: 0,
    totalTabs: 0,
    loading: true,
    error: null
  });

  const fetchSummary = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      const summary = await WindowUtils.getWindowSummary();
      setState({ ...summary, loading: false, error: null });
    } catch (error) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch window summary'
      }));
    }
  }, []);

  const refresh = useCallback(() => {
    fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchSummary, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchSummary]);

  return { ...state, refresh, fetchSummary };
}

export function useWindowOperations() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wrapAsync = useCallback(<T,>(fn: () => Promise<T>, errorMsg: string) => {
    return async () => {
      try {
        setLoading(true);
        setError(null);
        return await fn();
      } catch (error) {
        const msg = error instanceof Error ? error.message : errorMsg;
        setError(msg);
        throw new Error(msg);
      } finally {
        setLoading(false);
      }
    };
  }, []);

  const createWindow = useCallback(async (options: Parameters<typeof WindowCreator.createWindow>[0] = {}) => {
    return wrapAsync(() => WindowCreator.createWindow(options), 'Failed to create window')();
  }, [wrapAsync]);

  const createPopup = useCallback(async (url: string, width = 400, height = 300) => {
    return wrapAsync(() => WindowCreator.createPopup(url, width, height), 'Failed to create popup')();
  }, [wrapAsync]);

  const createIncognito = useCallback(async (url?: string) => {
    return wrapAsync(() => WindowCreator.createIncognitoWindow(url), 'Failed to create incognito window')();
  }, [wrapAsync]);

  const closeWindow = useCallback(async (windowId: number) => {
    return wrapAsync(() => WindowManipulator.closeWindow(windowId), 'Failed to close window')();
  }, [wrapAsync]);

  const focusWindow = useCallback(async (windowId: number) => {
    return wrapAsync(() => WindowManipulator.focusWindow(windowId), 'Failed to focus window')();
  }, [wrapAsync]);

  const minimizeWindow = useCallback(async (windowId: number) => {
    return wrapAsync(() => WindowManipulator.minimizeWindow(windowId), 'Failed to minimize window')();
  }, [wrapAsync]);

  const maximizeWindow = useCallback(async (windowId: number) => {
    return wrapAsync(() => WindowManipulator.maximizeWindow(windowId), 'Failed to maximize window')();
  }, [wrapAsync]);

  const restoreWindow = useCallback(async (windowId: number) => {
    return wrapAsync(() => WindowManipulator.restoreWindow(windowId), 'Failed to restore window')();
  }, [wrapAsync]);

  const moveWindow = useCallback(async (windowId: number, left: number, top: number) => {
    return wrapAsync(() => WindowManipulator.moveWindow(windowId, left, top), 'Failed to move window')();
  }, [wrapAsync]);

  const resizeWindow = useCallback(async (windowId: number, width: number, height: number) => {
    return wrapAsync(() => WindowManipulator.resizeWindow(windowId, width, height), 'Failed to resize window')();
  }, [wrapAsync]);

  const centerWindow = useCallback(async (windowId: number, width?: number, height?: number) => {
    return wrapAsync(() => WindowManipulator.centerWindow(windowId, width, height), 'Failed to center window')();
  }, [wrapAsync]);

  const clearError = useCallback(() => setError(null), []);

  return {
    loading,
    error,
    clearError,
    createWindow,
    createPopup,
    createIncognito,
    closeWindow,
    focusWindow,
    minimizeWindow,
    maximizeWindow,
    restoreWindow,
    moveWindow,
    resizeWindow,
    centerWindow
  };
}

export function useWindowFilter(windows: WindowInfo[]) {
  const normalWindows = useMemo(() => windows.filter(w => w.type === 'normal'), [windows]);
  const incognitoWindows = useMemo(() => windows.filter(w => w.incognito), [windows]);
  const popupWindows = useMemo(() => windows.filter(w => w.type === 'popup'), [windows]);
  const minimizedWindows = useMemo(() => windows.filter(w => w.state === 'minimized'), [windows]);
  const maximizedWindows = useMemo(() => windows.filter(w => w.state === 'maximized'), [windows]);
  const focusedWindow = useMemo(() => windows.find(w => w.focused) || null, [windows]);

  const filterWindows = useCallback((criteria: {
    type?: 'normal' | 'popup' | 'panel' | 'app' | 'devtools';
    state?: 'normal' | 'minimized' | 'maximized' | 'fullscreen';
    incognito?: boolean;
    focused?: boolean;
  }) => {
    return windows.filter(w => {
      if (criteria.type && w.type !== criteria.type) return false;
      if (criteria.state && w.state !== criteria.state) return false;
      if (criteria.incognito !== undefined && w.incognito !== criteria.incognito) return false;
      if (criteria.focused !== undefined && w.focused !== criteria.focused) return false;
      return true;
    });
  }, [windows]);

  return {
    normalWindows,
    incognitoWindows,
    popupWindows,
    minimizedWindows,
    maximizedWindows,
    focusedWindow,
    filterWindows
  };
}

export function useWindowExists(windowId: number | null) {
  const [exists, setExists] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  const checkExists = useCallback(async () => {
    if (!windowId) {
      setExists(null);
      return;
    }
    try {
      setLoading(true);
      const result = await WindowUtils.windowExists(windowId);
      setExists(result);
    } catch {
      setExists(false);
    } finally {
      setLoading(false);
    }
  }, [windowId]);

  useEffect(() => {
    checkExists();
  }, [checkExists]);

  return { exists, loading, checkExists };
}

export function useWindowState<T>(windowId: number | null, key: string, defaultValue: T) {
  const storageKey = windowId ? `window_${windowId}_${key}` : null;

  const [state, setState] = useState<T>(() => {
    if (!storageKey) return defaultValue;
    try {
      const stored = localStorage.getItem(storageKey);
      return stored ? JSON.parse(stored) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  const updateState = useCallback((newState: T | ((prev: T) => T)) => {
    setState(prev => {
      const nextState = typeof newState === 'function' ? (newState as (prev: T) => T)(prev) : newState;
      if (storageKey) {
        try {
          localStorage.setItem(storageKey, JSON.stringify(nextState));
        } catch {
          // Storage quota exceeded
        }
      }
      return nextState;
    });
  }, [storageKey]);

  const clearState = useCallback(() => {
    setState(defaultValue);
    if (storageKey) localStorage.removeItem(storageKey);
  }, [defaultValue, storageKey]);

  return [state, updateState, clearState] as const;
}

export function useWindowManager(options: {
  autoRefresh?: boolean;
  refreshInterval?: number;
  populate?: boolean;
} = {}) {
  const windows = useWindows(options);
  const currentWindow = useCurrentWindow(options);
  const summary = useWindowSummary(options);
  const operations = useWindowOperations();
  const filter = useWindowFilter(windows.windows);

  return {
    windows: windows.windows,
    currentWindow: currentWindow.currentWindow,
    summary,
    loading: windows.loading || currentWindow.loading || summary.loading,
    error: windows.error || currentWindow.error || summary.error,
    operations,
    filter,
    refresh: () => {
      windows.refresh();
      currentWindow.refresh();
      summary.refresh();
    },
    refreshWindows: windows.refresh,
    refreshCurrentWindow: currentWindow.refresh,
    refreshSummary: summary.refresh
  };
}
