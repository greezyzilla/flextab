import { describe, it, expect } from 'vitest';
import { mergeSpaces } from './spacesMerge';
import type { SavedSpace } from '~src/types';

const tab = (id: string) => ({ id, url: 'u' + id, title: 't', favicon: '', order: 0 });
const space = (id: string, name: string, tabs: ReturnType<typeof tab>[] = []): SavedSpace => ({
  id, name, order: 0,
  projects: [{ id: id + 'p', name: 'P', order: 0, categories: [{ id: id + 'c', name: 'C', order: 0, groups: [{ id: id + 'g', name: 'G', order: 0, tabs }] }] }],
});

function allTabIds(spaces: SavedSpace[]): string[] {
  const ids: string[] = [];
  for (const s of spaces) for (const p of s.projects) for (const c of p.categories) for (const g of c.groups) for (const t of g.tabs) ids.push(t.id);
  return ids.sort();
}

describe('mergeSpaces', () => {
  it('keeps server + local-only spaces (union)', () => {
    const out = mergeSpaces([space('s1', 'Work', [tab('t1')])], [space('l1', 'Research', [tab('t2')])]);
    expect(out.map(s => s.id).sort()).toEqual(['l1', 's1']);
  });

  it('deep-merges tabs of a same-id space — never drops a local tab', () => {
    // Same space id 'x', but local added tab t2 inside it (not yet on server).
    const server = [space('x', 'Work', [tab('t1')])];
    const local = [space('x', 'Work', [tab('t1'), tab('t2')])];
    const out = mergeSpaces(server, local);
    expect(out).toHaveLength(1);
    expect(allTabIds(out)).toEqual(['t1', 't2']); // <-- t2 preserved (was lost with shallow merge)
  });

  it('unions disjoint tabs of a same-id space (concurrent adds from two devices)', () => {
    const server = [space('x', 'Work', [tab('a')])];
    const local = [space('x', 'Work', [tab('b')])];
    expect(allTabIds(mergeSpaces(server, local))).toEqual(['a', 'b']);
  });

  it('drops the guest empty default "Personal" when the account has data', () => {
    const out = mergeSpaces([space('s1', 'Work', [tab('t1')])], [space('def', 'Personal', [])]);
    expect(out.map(s => s.name)).toEqual(['Work']);
  });

  it('keeps a non-empty "Personal" from local', () => {
    const out = mergeSpaces([space('s1', 'Work', [tab('t1')])], [space('p', 'Personal', [tab('t2')])]);
    expect(out.map(s => s.name).sort()).toEqual(['Personal', 'Work']);
  });

  it('tolerates spaces with missing nested arrays', () => {
    const sparse = { id: 'sp', name: 'Sparse', order: 0 } as unknown as SavedSpace; // no projects
    const out = mergeSpaces([], [sparse]);
    expect(out.map(s => s.id)).toEqual(['sp']);
    // a same-id collision with a sparse side must not throw
    const out2 = mergeSpaces([sparse], [space('sp', 'Sparse', [tab('t')])]);
    expect(out2).toHaveLength(1);
    expect(allTabIds(out2)).toEqual(['t']);
  });
});
