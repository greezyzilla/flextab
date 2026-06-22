import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getStoredRevision, setStoredRevision } from './revision';

describe('revision store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('setStoredRevision persists and is read back from cache', async () => {
    await setStoredRevision(7);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ flextab_sync_revision: 7 });
    // Cached — no storage read needed.
    expect(await getStoredRevision()).toBe(7);
  });
});
