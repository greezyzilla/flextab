import { describe, it, expect, vi } from 'vitest';

// syncEngine pulls in stores/WS at import; we only need the pure mergeSpaces.
vi.mock('~src/store/useSavedSpacesStore', () => ({ ensureDefaultData: vi.fn() }));
vi.mock('~src/store/useSyncConflict', () => ({ useSyncConflict: { getState: () => ({ open: vi.fn(), close: vi.fn() }) } }));

import { mergeSpaces } from './syncEngine';
import type { SavedSpace } from '~src/types';

const tab = (id: string) => ({ id, url: 'u', title: 't', favicon: '', order: 0 });
const space = (id: string, name: string, tabs: ReturnType<typeof tab>[] = []): SavedSpace => ({
  id, name, order: 0,
  projects: [{ id: id + 'p', name: 'P', order: 0, categories: [{ id: id + 'c', name: 'C', order: 0, groups: [{ id: id + 'g', name: 'G', order: 0, tabs }] }] }],
});

describe('mergeSpaces', () => {
  it('keeps server + local-only spaces (lossless union)', () => {
    const server = [space('s1', 'Work', [tab('t1')])];
    const local = [space('l1', 'Research', [tab('t2')])];
    const out = mergeSpaces(server, local);
    expect(out.map(s => s.id).sort()).toEqual(['l1', 's1']);
  });

  it('server wins on an id collision (no duplicate)', () => {
    const server = [space('x', 'Work-server', [tab('t1')])];
    const local = [space('x', 'Work-local', [tab('t2')])];
    const out = mergeSpaces(server, local);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('Work-server');
  });

  it('drops the guest empty default "Personal" when the account has data', () => {
    const server = [space('s1', 'Work', [tab('t1')])];
    const local = [space('def', 'Personal', [])]; // empty default
    const out = mergeSpaces(server, local);
    expect(out.map(s => s.name)).toEqual(['Work']);
  });

  it('keeps a non-empty "Personal" from local', () => {
    const server = [space('s1', 'Work', [tab('t1')])];
    const local = [space('p', 'Personal', [tab('t2')])];
    const out = mergeSpaces(server, local);
    expect(out.map(s => s.name).sort()).toEqual(['Personal', 'Work']);
  });
});
