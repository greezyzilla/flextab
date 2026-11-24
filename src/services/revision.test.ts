import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getStoredRevision, setStoredRevision, clearStoredRevision } from './revision';

describe('revision store', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    (chrome.storage.local.get as any).mockResolvedValue({});
    await clearStoredRevision(); // reset in-memory cache
  });

  it('returns null when nothing is stored', async () => {
    (chrome.storage.local.get as any).mockResolvedValue({});
    expect(await getStoredRevision()).toBeNull();
  });

  it('reads a stored numeric revision', async () => {
    (chrome.storage.local.get as any).mockResolvedValue({ flextab_sync_revision: 12 });
    expect(await getStoredRevision()).toBe(12);
  });

  it('ignores a non-numeric stored value', async () => {
    (chrome.storage.local.get as any).mockResolvedValue({ flextab_sync_revision: 'x' });
    expect(await getStoredRevision()).toBeNull();
  });

  it('returns null when storage throws', async () => {
    (chrome.storage.local.get as any).mockRejectedValue(new Error('no ctx'));
    expect(await getStoredRevision()).toBeNull();
  });

  it('setStoredRevision persists and is served from cache', async () => {
    await setStoredRevision(7);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ flextab_sync_revision: 7 });
    (chrome.storage.local.get as any).mockResolvedValue({}); // cache should win
    expect(await getStoredRevision()).toBe(7);
  });

  it('clearStoredRevision removes the key and resets the cache', async () => {
    await setStoredRevision(5);
    await clearStoredRevision();
    expect(chrome.storage.local.remove).toHaveBeenCalledWith('flextab_sync_revision');
    (chrome.storage.local.get as any).mockResolvedValue({});
    expect(await getStoredRevision()).toBeNull();
  });
});
