import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getDeviceId } from './api';

describe('getDeviceId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (chrome.storage.local.get as any).mockResolvedValue({}); // nothing stored yet
  });

  it('resolves concurrent first-run calls to a single id and persists once', async () => {
    const [a, b, c] = await Promise.all([getDeviceId(), getDeviceId(), getDeviceId()]);

    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(a).toBeTruthy();
    // A duplicate-device bug would persist (and use) multiple ids.
    expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);
  });
});
