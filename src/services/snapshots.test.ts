import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./api', () => ({ apiFetch: vi.fn() }));
import { apiListSnapshots, apiGetSnapshot, apiRestoreSnapshot } from './snapshots';
import { apiFetch } from './api';

beforeEach(() => vi.clearAllMocks());

describe('apiListSnapshots', () => {
  it('returns the snapshots array', async () => {
    const snapshots = [{ revision: 5, created_at: '2026-01-01', space_count: 2, tab_count: 9 }];
    (apiFetch as any).mockResolvedValue({ snapshots });
    expect(await apiListSnapshots()).toEqual(snapshots);
    expect(apiFetch).toHaveBeenCalledWith('/api/snapshots');
  });

  it('falls back to [] when omitted', async () => {
    (apiFetch as any).mockResolvedValue({});
    expect(await apiListSnapshots()).toEqual([]);
  });
});

describe('apiGetSnapshot', () => {
  it('returns the stored tree for a revision', async () => {
    const spaces = [{ id: 's1', name: 'S', projects: [] }];
    (apiFetch as any).mockResolvedValue({ spaces });
    expect(await apiGetSnapshot(5)).toEqual(spaces);
    expect(apiFetch).toHaveBeenCalledWith('/api/snapshots/5');
  });

  it('falls back to [] when omitted', async () => {
    (apiFetch as any).mockResolvedValue({});
    expect(await apiGetSnapshot(3)).toEqual([]);
  });
});

describe('apiRestoreSnapshot', () => {
  it('POSTs the restore and returns the new revision', async () => {
    (apiFetch as any).mockResolvedValue({ revision: 12 });
    expect(await apiRestoreSnapshot(5)).toBe(12);
    expect(apiFetch).toHaveBeenCalledWith('/api/snapshots/5/restore', { method: 'POST' });
  });
});
