import { describe, expect, it } from 'vitest';
import { canonicalSpaces, sameTree } from './canonicalSpaces';
import type { SavedSpace } from '~src/types';

const t = (id: string, order?: number) => ({ id, url: `https://x.test/${id}`, title: id, favicon: '', ...(order === undefined ? {} : { order }) });
const space = (groups: unknown[]): SavedSpace[] => ([
  { id: 's', name: 'S', order: 0, projects: [{ id: 'p', name: 'P', order: 0, categories: [{ id: 'c', name: 'C', order: 0, groups }] }] },
] as unknown as SavedSpace[]);
const groupsOf = (spaces: SavedSpace[]) => spaces[0].projects[0].categories[0].groups;

describe('canonicalSpaces', () => {
  it('sorts an item without an order as 0, keeping its place among equals', () => {
    const c = canonicalSpaces(space([{ id: 'g', name: 'G', order: 0, tabs: [t('b', 1), t('a'), t('c', -1)] }]));
    expect(groupsOf(c)[0].tabs.map((x) => [x.id, x.order])).toEqual([['c', 0], ['a', 1], ['b', 2]]);
  });

  it('keeps one copy of a tab id that a list holds twice', () => {
    const c = canonicalSpaces(space([{ id: 'g', name: 'G', order: 0, tabs: [t('a', 0), { ...t('a', 1), title: 'second' }] }]));
    expect(groupsOf(c)[0].tabs).toHaveLength(1);
    expect(groupsOf(c)[0].tabs[0].title).toBe('a');
  });

  it('folds a group held twice into one, even when the first copy has no tab list', () => {
    const c = canonicalSpaces(space([{ id: 'g', name: 'G', order: 0 }, { id: 'g', name: 'G', order: 1, tabs: [t('a', 0)] }]));
    expect(groupsOf(c)).toHaveLength(1);
    expect(groupsOf(c)[0].tabs.map((x) => x.id)).toEqual(['a']);
  });

  it('folds a group held twice into one when the second copy has no tab list', () => {
    const c = canonicalSpaces(space([{ id: 'g', name: 'G', order: 0, tabs: [t('a', 0)] }, { id: 'g', name: 'G', order: 1 }]));
    expect(groupsOf(c)).toHaveLength(1);
    expect(groupsOf(c)[0].tabs.map((x) => x.id)).toEqual(['a']);
  });

  it('gives a node without a child list an empty one', () => {
    const c = canonicalSpaces([{ id: 's', name: 'S', order: 0 }] as unknown as SavedSpace[]);
    expect(c[0].projects).toEqual([]);
  });

  it('treats a missing tree as empty', () => {
    expect(canonicalSpaces(null as unknown as SavedSpace[])).toEqual([]);
    expect(sameTree(null, [])).toBe(true);
    expect(sameTree(undefined, space([]))).toBe(false);
  });
});
