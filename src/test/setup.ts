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
  },
  windows: {
    get: vi.fn(),
    getCurrent: vi.fn(),
    getAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
  storage: {
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
  runtime: {
    getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
    id: 'test-extension-id',
  },
} as any;