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

  it('counts tabs defensively (spaceTabCount || [] at every depth)', () => {
    // emptyDefault check calls spaceTabCount on local-only "Personal" spaces;
    // these are sparse at each level, so every `|| []` fallback is exercised.
    const realServer = [space('s1', 'Work', [tab('t1')])];
    const personalNoProjects = { id: 'a', name: 'Personal', order: 0 } as unknown as SavedSpace;
    const personalNoCategories = { id: 'b', name: 'Personal', order: 0, projects: [{ id: 'bp', name: 'P', order: 0 }] } as unknown as SavedSpace;
    const personalNoGroups = { id: 'c', name: 'Personal', order: 0, projects: [{ id: 'cp', name: 'P', order: 0, categories: [{ id: 'cc', name: 'C', order: 0 }] }] } as unknown as SavedSpace;
    // all dropped as empty default placeholders → only Work survives
    expect(mergeSpaces(realServer, [personalNoProjects, personalNoCategories, personalNoGroups]).map(s => s.name)).toEqual(['Work']);
  });

  it('deep-merges a same-id collision where the SERVER side lacks nested arrays', () => {
    // Full local trees with explicit ids so they collide with the sparse server.
    const full = (sid: string, t: string): SavedSpace => ({ id: sid, name: sid, order: 0, projects: [{ id: 'p', name: 'P', order: 0, categories: [{ id: 'c', name: 'C', order: 0, groups: [{ id: 'g', name: 'G', order: 0, tabs: [tab(t)] }] }] }] });
    const serverProjNoCats = [{ id: 'x', name: 'X', order: 0, projects: [{ id: 'p', name: 'P', order: 0 }] } as unknown as SavedSpace]; // mergeProject a.categories||[]
    const serverCatNoGroups = [{ id: 'y', name: 'Y', order: 0, projects: [{ id: 'p', name: 'P', order: 0, categories: [{ id: 'c', name: 'C', order: 0 }] }] } as unknown as SavedSpace]; // mergeCategory a.groups||[]
    expect(allTabIds(mergeSpaces(serverProjNoCats, [full('x', 'tx')]))).toEqual(['tx']);
    expect(allTabIds(mergeSpaces(serverCatNoGroups, [full('y', 'ty')]))).toEqual(['ty']);
  });

  it('deep-merges a same-id collision where the LOCAL side lacks nested arrays', () => {
    const serverFull = (sid: string): SavedSpace => ({ id: sid, name: sid, order: 0, projects: [{ id: 'p', name: 'P', order: 0, categories: [{ id: 'c', name: 'C', order: 0, groups: [{ id: 'g', name: 'G', order: 0, tabs: [tab('keep')] }] }] }] });
    const localNoProjects = { id: 'x', name: 'x', order: 0 } as unknown as SavedSpace;                                                   // mergeSpace b.projects||[]
    const localNoCats = { id: 'y', name: 'y', order: 0, projects: [{ id: 'p', name: 'P', order: 0 }] } as unknown as SavedSpace;          // mergeProject b.categories||[]
    const localNoGroups = { id: 'z', name: 'z', order: 0, projects: [{ id: 'p', name: 'P', order: 0, categories: [{ id: 'c', name: 'C', order: 0 }] }] } as unknown as SavedSpace; // mergeCategory b.groups||[]
    const localNoTabs = { id: 'w', name: 'w', order: 0, projects: [{ id: 'p', name: 'P', order: 0, categories: [{ id: 'c', name: 'C', order: 0, groups: [{ id: 'g', name: 'G', order: 0 }] }] }] } as unknown as SavedSpace; // mergeGroup b.tabs||[]
    expect(allTabIds(mergeSpaces([serverFull('x')], [localNoProjects]))).toEqual(['keep']);
    expect(allTabIds(mergeSpaces([serverFull('y')], [localNoCats]))).toEqual(['keep']);
    expect(allTabIds(mergeSpaces([serverFull('z')], [localNoGroups]))).toEqual(['keep']);
    expect(allTabIds(mergeSpaces([serverFull('w')], [localNoTabs]))).toEqual(['keep']);
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
