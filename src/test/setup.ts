import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
});

global.chrome = {
  tabs: {
    create: vi.fn(),
    query: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    move: vi.fn(),
    duplicate: vi.fn(),
    onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
    onCreated: { addListener: vi.fn(), removeListener: vi.fn() },
    onRemoved: { addListener: vi.fn(), removeListener: vi.fn() },
    onActivated: { addListener: vi.fn(), removeListener: vi.fn() },
    onMoved: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  windows: {
    get: vi.fn(),
    getCurrent: vi.fn(),
    getAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    onCreated: { addListener: vi.fn(), removeListener: vi.fn() },
    onRemoved: { addListener: vi.fn(), removeListener: vi.fn() },
    onFocusChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  storage: {
    session: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}), remove: vi.fn(async () => {}) },
    local: {
      get: vi.fn((keys: string | string[] | Record<string, any> | null, callback?: (items: Record<string, any>) => void) => {
        const result = {};
        if (callback) callback(result);
        return Promise.resolve(result);
      }),
      set: vi.fn((items: Record<string, any>, callback?: () => void) => {
        if (callback) callback();
        return Promise.resolve();
      }),
      remove: vi.fn((keys: string | string[], callback?: () => void) => {
        if (callback) callback();
        return Promise.resolve();
      }),
      clear: vi.fn((callback?: () => void) => {
        if (callback) callback();
        return Promise.resolve();
      }),
    },
    sync: {
      get: vi.fn((keys: string | string[] | Record<string, any> | null, callback?: (items: Record<string, any>) => void) => {
        const result = {};
        if (callback) callback(result);
        return Promise.resolve(result);
      }),
      set: vi.fn((items: Record<string, any>, callback?: () => void) => {
        if (callback) callback();
        return Promise.resolve();
      }),
      remove: vi.fn((keys: string | string[], callback?: () => void) => {
        if (callback) callback();
        return Promise.resolve();
      }),
      clear: vi.fn((callback?: () => void) => {
        if (callback) callback();
        return Promise.resolve();
      }),
    },
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  action: {
    setBadgeText: vi.fn(async () => {}),
    setBadgeBackgroundColor: vi.fn(async () => {}),
    setTitle: vi.fn(async () => {}),
    setIcon: vi.fn(async () => {}),
    openPopup: vi.fn(async () => {}),
  },
  contextMenus: {
    create: vi.fn(),
    removeAll: vi.fn((callback?: () => void) => { callback?.(); }),
    onClicked: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  commands: {
    onCommand: { addListener: vi.fn(), removeListener: vi.fn() },
    // The manifest's suggested keys, as Chrome reports them before anyone changes them.
    getAll: vi.fn(async () => [
      { name: "save-page", shortcut: "Alt+Shift+S" },
      { name: "save-window", shortcut: "Alt+Shift+W" },
    ]),
  },
  runtime: {
    getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
    id: 'test-extension-id',
    sendMessage: vi.fn(async () => ({ ok: true })),
    onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
    onConnect: { addListener: vi.fn(), removeListener: vi.fn() },
    connect: vi.fn(() => ({ postMessage: vi.fn(), disconnect: vi.fn(), onMessage: { addListener: vi.fn() }, onDisconnect: { addListener: vi.fn() } })),
  },
} as any;