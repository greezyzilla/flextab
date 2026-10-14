import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the API + revision store the OCC loop depends on.
vi.mock('./api', () => ({
  pushSync: vi.fn(),
  fetchSyncRevision: vi.fn(),
}));
vi.mock('./revision', () => {
  let rev: number | null = null;
  return {
    getStoredRevision: vi.fn(async () => rev),
    setStoredRevision: vi.fn(async (r: number) => { rev = r; }),
    __setRev: (r: number | null) => { rev = r; },
  };
});

import { syncStructuredSnapshot } from './structuredSync';
import { pushSync, fetchSyncRevision } from './api';
import { getStoredRevision, setStoredRevision } from './revision';

const SPACES = [{ id: 's1' }];

beforeEach(() => {
  vi.clearAllMocks();
  (getStoredRevision as any).mockResolvedValue(null);
});

describe('syncStructuredSnapshot', () => {
  it('skips an empty snapshot', async () => {
    const result = await syncStructuredSnapshot([], async () => []);
    expect(result).toBe('skipped');
    expect(pushSync).not.toHaveBeenCalled();
  });

  it('seeds base_revision from the server when unknown, then pushes', async () => {
    (getStoredRevision as any).mockResolvedValue(null);
    (fetchSyncRevision as any).mockResolvedValue(3);
    (pushSync as any).mockResolvedValue({ status: 'ok', revision: 4 });

    const result = await syncStructuredSnapshot(SPACES, async () => SPACES);

    expect(result).toBe('ok');
    // Pushed with the seeded base revision (3), never null (the overwrite hole).
    expect(pushSync).toHaveBeenCalledWith(SPACES, 3);
    expect(setStoredRevision).toHaveBeenLastCalledWith(4);
  });

  it('never pushes unconditionally — bails if the revision cannot be seeded', async () => {
    (getStoredRevision as any).mockResolvedValue(null);
    (fetchSyncRevision as any).mockResolvedValue(null); // offline

    const result = await syncStructuredSnapshot(SPACES, async () => SPACES);

    expect(result).toBe('error');
    expect(pushSync).not.toHaveBeenCalled();
  });

  it('on conflict: adopts the server revision, re-derives, and retries (no overwrite)', async () => {
    (getStoredRevision as any).mockResolvedValue(5);
    const merged = [{ id: 's1', merged: true }];
    const reRead = vi.fn().mockResolvedValue(merged);
    (pushSync as any)
      .mockResolvedValueOnce({ status: 'conflict', revision: 9, spaces: [] })
      .mockResolvedValueOnce({ status: 'ok', revision: 10 });

    const result = await syncStructuredSnapshot(SPACES, reRead);

    expect(result).toBe('ok');
    expect(reRead).toHaveBeenCalledTimes(1);
    // First push used stale base 5; retry used the server's revision 9 with the
    // re-derived (CRDT-merged) snapshot.
    expect(pushSync).toHaveBeenNthCalledWith(1, SPACES, 5);
    expect(pushSync).toHaveBeenNthCalledWith(2, merged, 9);
    expect(setStoredRevision).toHaveBeenLastCalledWith(10);
  });

  it('on conflict, merges the server payload with local before retrying (no lost update)', async () => {
    (getStoredRevision as any).mockResolvedValue(5);
    const serverState = [{ id: 'server-change' }];
    const localState = [{ id: 'local-change' }];
    const mergeOnConflict = vi.fn((s: unknown[], l: unknown[]) => [...s, ...l]);
    (pushSync as any)
      .mockResolvedValueOnce({ status: 'conflict', revision: 9, spaces: serverState })
      .mockResolvedValueOnce({ status: 'ok', revision: 10 });

    const result = await syncStructuredSnapshot(localState, async () => localState, mergeOnConflict);

    expect(result).toBe('ok');
    // The retry pushed the MERGED state (server's change + local's), not stale local.
    expect(mergeOnConflict).toHaveBeenCalledWith(serverState, localState);
    expect(pushSync).toHaveBeenNthCalledWith(2, [...serverState, ...localState], 9);
  });

  it('defers (skipped) when mergeOnConflict returns null — a true conflict', async () => {
    (getStoredRevision as any).mockResolvedValue(5);
    const mergeOnConflict = vi.fn(() => null); // true conflict → needs interactive resolve
    (pushSync as any).mockResolvedValue({ status: 'conflict', revision: 9, spaces: [{ id: 'x' }] });

    const result = await syncStructuredSnapshot([{ id: 's1' }], async () => [{ id: 's1' }], mergeOnConflict);

    expect(result).toBe('skipped');
    // Did not push again after the null (no silent auto-resolve of a true conflict).
    expect((pushSync as any).mock.calls.length).toBe(1);
  });

  it('awaits an async mergeOnConflict', async () => {
    (getStoredRevision as any).mockResolvedValue(5);
    const merged = [{ id: 'm' }];
    const mergeOnConflict = vi.fn(async () => merged);
    (pushSync as any)
      .mockResolvedValueOnce({ status: 'conflict', revision: 9, spaces: [] })
      .mockResolvedValueOnce({ status: 'ok', revision: 10 });

    const result = await syncStructuredSnapshot([{ id: 's1' }], async () => [{ id: 's1' }], mergeOnConflict);

    expect(result).toBe('ok');
    expect(pushSync).toHaveBeenNthCalledWith(2, merged, 9);
  });

  it('calls onPushed with the landed spaces + revision on a confirmed push', async () => {
    (getStoredRevision as any).mockResolvedValue(3);
    (pushSync as any).mockResolvedValue({ status: 'ok', revision: 4 });
    const onPushed = vi.fn();

    await syncStructuredSnapshot(SPACES, async () => SPACES, undefined, onPushed);

    expect(onPushed).toHaveBeenCalledWith(SPACES, 4, SPACES);
  });

  it('returns error when the push errors mid-loop', async () => {
    (getStoredRevision as any).mockResolvedValue(5);
    (pushSync as any).mockResolvedValue({ status: 'error' });
    expect(await syncStructuredSnapshot(SPACES, async () => SPACES)).toBe('error');
  });

  it('returns skipped when a conflict re-read yields nothing', async () => {
    (getStoredRevision as any).mockResolvedValue(5);
    (pushSync as any).mockResolvedValue({ status: 'conflict', revision: 6, spaces: [] });
    expect(await syncStructuredSnapshot(SPACES, async () => [])).toBe('skipped');
  });

  it('gives up after bounded retries under sustained contention', async () => {
    (getStoredRevision as any).mockResolvedValue(1);
    (pushSync as any).mockResolvedValue({ status: 'conflict', revision: 2, spaces: [] });

    const result = await syncStructuredSnapshot(SPACES, async () => SPACES);

    expect(result).toBe('error');
    expect((pushSync as any).mock.calls.length).toBeLessThanOrEqual(4);
  });

  it('on a plan-limit rejection: reports it via onLimit and stops (no retry)', async () => {
    (getStoredRevision as any).mockResolvedValue(1);
    (pushSync as any).mockResolvedValue({ status: 'limit', message: 'total tab limit reached (501/500) on the free plan' });
    const onLimit = vi.fn();

    const result = await syncStructuredSnapshot(SPACES, async () => SPACES, undefined, undefined, onLimit);

    expect(result).toBe('limit');
    expect(onLimit).toHaveBeenCalledWith('total tab limit reached (501/500) on the free plan');
    expect((pushSync as any).mock.calls.length).toBe(1); // no retry — retrying can't help
  });
});
