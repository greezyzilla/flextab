import { describe, it, expect, beforeEach } from 'vitest';
import { useSyncConflict } from './useSyncConflict';
import type { SavedSpace } from '~src/types';

const space = (id: string): SavedSpace => ({ id, name: id, order: 0, projects: [] });

beforeEach(() => useSyncConflict.getState().close());

describe('useSyncConflict', () => {
  it('opens with the candidate datasets', () => {
    const server = [space('a')], local = [space('b')];
    useSyncConflict.getState().open(server, local);
    const s = useSyncConflict.getState();
    expect(s.pending).toBe(true);
    expect(s.server).toBe(server);
    expect(s.local).toBe(local);
  });

  it('close clears the pending state and datasets', () => {
    useSyncConflict.getState().open([space('a')], [space('b')]);
    useSyncConflict.getState().close();
    const s = useSyncConflict.getState();
    expect(s.pending).toBe(false);
    expect(s.server).toEqual([]);
    expect(s.local).toEqual([]);
  });
});
