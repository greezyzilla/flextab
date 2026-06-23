import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./api', () => ({ apiFetch: vi.fn() }));
import { apiGetDevices } from './device';
import { apiFetch } from './api';

beforeEach(() => vi.clearAllMocks());

describe('apiGetDevices', () => {
  it('returns the devices array from the API', async () => {
    const devices = [{ id: 'd1', label: 'Chrome · macOS', user_agent: 'ua', created_at: '', last_seen_at: '', last_synced_at: null }];
    (apiFetch as any).mockResolvedValue({ devices });
    expect(await apiGetDevices()).toEqual(devices);
    expect(apiFetch).toHaveBeenCalledWith('/api/devices');
  });

  it('falls back to an empty array when the API omits devices', async () => {
    (apiFetch as any).mockResolvedValue({});
    expect(await apiGetDevices()).toEqual([]);
  });
});
