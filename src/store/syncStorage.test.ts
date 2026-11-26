import { describe, it, expect, vi, beforeEach } from 'vitest';
import { storage, setupStorageSync } from './syncStorage';

// Add sync-area mocks (the shared setup only mocks local).
beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  (chrome.storage.local.get as any).mockResolvedValue({});
  (chrome.storage.local.set as any).mockResolvedValue(undefined);
  (chrome.storage.local.remove as any).mockResolvedValue(undefined);
  (chrome.storage as { sync: unknown }).sync = {
    get: vi.fn().mockResolvedValue({}),
    set: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  } as any;
});

describe('storage.getItem', () => {
  it('returns the local value when present', async () => {
    (chrome.storage.local.get as any).mockResolvedValue({ k: 'local-val' });
    expect(await storage.getItem('k')).toBe('local-val');
  });

  it('bootstraps from chunked sync when local is empty', async () => {
    (chrome.storage.local.get as any).mockResolvedValue({});
    (chrome.storage.sync.get as any).mockImplementation(async (key: string) => {
      if (key === 'k__meta') return { k__meta: { chunks: 2, ts: 1 } };
      return { k__0: 'hel', k__1: 'lo' };
    });
    expect(await storage.getItem('k')).toBe('hello');
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ k: 'hello' });
  });

  it('returns null when neither local nor sync has the value', async () => {
    (chrome.storage.sync.get as any).mockResolvedValue({}); // no meta
    expect(await storage.getItem('k')).toBeNull();
  });

  it('returns null for incomplete (corrupted) chunks', async () => {
    (chrome.storage.sync.get as any).mockImplementation(async (key: string) => {
      if (key === 'k__meta') return { k__meta: { chunks: 2, ts: 1 } };
      return { k__0: 'hel' }; // k__1 missing
    });
    expect(await storage.getItem('k')).toBeNull();
  });

  it('returns null on read error', async () => {
    (chrome.storage.local.get as any).mockRejectedValue(new Error('boom'));
    expect(await storage.getItem('k')).toBeNull();
  });
});

describe('storage.setItem', () => {
  it('writes to local immediately and schedules a chunked sync write', async () => {
    vi.useFakeTimers();
    (chrome.storage.sync.get as any).mockResolvedValue({ 'k__9': 'stale' }); // a stale chunk to prune
    await storage.setItem('k', JSON.stringify({ state: { a: 1 }, version: 1 }));
    expect(chrome.storage.local.set).toHaveBeenCalled();
    // local write carries an injected lastModified timestamp
    const written = (chrome.storage.local.set as any).mock.calls[0][0].k;
    expect(JSON.parse(written).state.lastModified).toBeTypeOf('number');

    await vi.advanceTimersByTimeAsync(2000); // debounce fires
    expect(chrome.storage.sync.set).toHaveBeenCalled();
    expect(chrome.storage.sync.remove).toHaveBeenCalledWith(['k__9']); // stale pruned
    vi.useRealTimers();
  });

  it('keeps non-JSON values intact (timestamp injection is best-effort)', async () => {
    await storage.setItem('k', 'not-json');
    expect((chrome.storage.local.set as any).mock.calls[0][0].k).toBe('not-json');
  });

  it('keeps the local write when the debounced sync write is refused', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (chrome.storage.sync.set as any).mockRejectedValue(new Error('QUOTA_BYTES quota exceeded'));
    await storage.setItem('k', JSON.stringify({ state: { a: 1 } }));
    await vi.advanceTimersByTimeAsync(2000);
    expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('[FlexTab] Sync write failed:', expect.any(Error));
    warn.mockRestore();
    vi.useRealTimers();
  });

  it('swallows write errors', async () => {
    (chrome.storage.local.set as any).mockRejectedValue(new Error('quota'));
    await expect(storage.setItem('k', '{}')).resolves.toBeUndefined();
  });
});

describe('storage.removeItem', () => {
  it('removes from local and sync', async () => {
    (chrome.storage.sync.get as any).mockResolvedValue({ k__0: 'a', k__meta: {} });
    await storage.removeItem('k');
    expect(chrome.storage.local.remove).toHaveBeenCalledWith('k');
    expect(chrome.storage.sync.remove).toHaveBeenCalled();
  });
  it('swallows remove errors', async () => {
    (chrome.storage.local.remove as any).mockRejectedValue(new Error('x'));
    await expect(storage.removeItem('k')).resolves.toBeUndefined();
  });
  it('leaves sync storage alone when it holds no chunks for the key', async () => {
    (chrome.storage.sync.get as any).mockResolvedValue({ other__0: 'a' });
    await storage.removeItem('k');
    expect(chrome.storage.local.remove).toHaveBeenCalledWith('k');
    expect(chrome.storage.sync.remove).not.toHaveBeenCalled();
  });
  it('still removes the local copy when sync storage is unreachable', async () => {
    (chrome.storage.sync.get as any).mockRejectedValue(new Error('sync disabled'));
    await expect(storage.removeItem('k')).resolves.toBeUndefined();
    expect(chrome.storage.local.remove).toHaveBeenCalledWith('k');
  });
});

describe('setupStorageSync', () => {
  function lastListener() {
    const calls = (chrome.storage.onChanged.addListener as any).mock.calls;
    return calls[calls.length - 1][0] as (c: any, a: string) => Promise<void>;
  }

  it('rehydrates on a cross-tab local change', async () => {
    const rehydrate = vi.fn().mockResolvedValue(undefined);
    setupStorageSync('store', rehydrate);
    await lastListener()({ store: { newValue: 'x' } }, 'local');
    expect(rehydrate).toHaveBeenCalled();
  });

  it('applies a newer cross-device sync change', async () => {
    const rehydrate = vi.fn().mockResolvedValue(undefined);
    (chrome.storage.sync.get as any).mockImplementation(async (key: string) => {
      if (key === 'store__meta') return { store__meta: { chunks: 1, ts: 1 } };
      return { store__0: JSON.stringify({ state: { lastModified: 999 } }) };
    });
    (chrome.storage.local.get as any).mockResolvedValue({ store: JSON.stringify({ state: { lastModified: 1 } }) });
    setupStorageSync('store', rehydrate);
    await lastListener()({ store__0: { newValue: 'x' } }, 'sync');
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ store: expect.any(String) });
    expect(rehydrate).toHaveBeenCalled();
  });

  it('ignores an older cross-device change (local wins)', async () => {
    const rehydrate = vi.fn();
    (chrome.storage.sync.get as any).mockImplementation(async (key: string) => {
      if (key === 'store__meta') return { store__meta: { chunks: 1, ts: 1 } };
      return { store__0: JSON.stringify({ state: { lastModified: 1 } }) };
    });
    (chrome.storage.local.get as any).mockResolvedValue({ store: JSON.stringify({ state: { lastModified: 999 } }) });
    setupStorageSync('store', rehydrate);
    await lastListener()({ store__0: { newValue: 'x' } }, 'sync');
    expect(rehydrate).not.toHaveBeenCalled();
  });

  const syncHolds = (value: string | null) => {
    (chrome.storage.sync.get as any).mockImplementation(async (key: string) => {
      if (value === null) return {};
      if (key === 'store__meta') return { store__meta: { chunks: 1, ts: 1 } };
      return { store__0: value };
    });
  };

  it('applies a cross-device change when this device has nothing stored yet', async () => {
    const rehydrate = vi.fn().mockResolvedValue(undefined);
    const remote = JSON.stringify({ state: { lastModified: 5 } });
    syncHolds(remote);
    (chrome.storage.local.get as any).mockResolvedValue({});
    setupStorageSync('store', rehydrate);
    await lastListener()({ store__0: { newValue: 'x' } }, 'sync');
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ store: remote });
    expect(rehydrate).toHaveBeenCalledTimes(1);
  });

  it('lets a timestamped cross-device change win over a local copy that has no timestamp', async () => {
    const rehydrate = vi.fn().mockResolvedValue(undefined);
    syncHolds(JSON.stringify({ state: { lastModified: 5 } }));
    (chrome.storage.local.get as any).mockResolvedValue({ store: JSON.stringify({ state: {} }) });
    setupStorageSync('store', rehydrate);
    await lastListener()({ store__0: { newValue: 'x' } }, 'sync');
    expect(rehydrate).toHaveBeenCalledTimes(1);
  });

  it('lets a cross-device change replace an unreadable local copy', async () => {
    const rehydrate = vi.fn().mockResolvedValue(undefined);
    syncHolds(JSON.stringify({ state: { lastModified: 5 } }));
    (chrome.storage.local.get as any).mockResolvedValue({ store: 'not-json' });
    setupStorageSync('store', rehydrate);
    await lastListener()({ store__0: { newValue: 'x' } }, 'sync');
    expect(rehydrate).toHaveBeenCalledTimes(1);
  });

  it('ignores a cross-device change whose chunks have not all arrived', async () => {
    const rehydrate = vi.fn();
    (chrome.storage.sync.get as any).mockImplementation(async (key: string) =>
      key === 'store__meta' ? { store__meta: { chunks: 2, ts: 1 } } : { store__0: 'half' });
    setupStorageSync('store', rehydrate);
    await lastListener()({ store__0: { newValue: 'x' } }, 'sync');
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    expect(rehydrate).not.toHaveBeenCalled();
  });

  it('ignores sync changes to other stores and changes in other areas', async () => {
    const rehydrate = vi.fn();
    setupStorageSync('store', rehydrate);
    await lastListener()({ other__0: { newValue: 'x' } }, 'sync');
    await lastListener()({ store: { newValue: 'x' } }, 'session');
    expect(chrome.storage.sync.get).not.toHaveBeenCalled();
    expect(rehydrate).not.toHaveBeenCalled();
  });

  it('does not echo its own rehydrate: no nested rehydrate, no write back to sync', async () => {
    vi.useFakeTimers();
    const rehydrate = vi.fn(async () => {
      // What the persist middleware does while rehydrating: write the state back,
      // which fires another change event in this context.
      await storage.setItem('store', JSON.stringify({ state: { a: 1 } }));
      await listener({ store: { newValue: 'y' } }, 'local');
    });
    setupStorageSync('store', rehydrate);
    const listener = lastListener();
    await listener({ store: { newValue: 'x' } }, 'local');
    expect(rehydrate).toHaveBeenCalledTimes(1);
    expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('does nothing without an extension storage event source', () => {
    const saved = chrome.storage.onChanged;
    (chrome.storage as any).onChanged = undefined;
    try {
      expect(() => setupStorageSync('store', vi.fn())).not.toThrow();
    } finally {
      (chrome.storage as any).onChanged = saved;
    }
    expect(chrome.storage.onChanged.addListener).not.toHaveBeenCalled();
  });
});

