import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as Y from 'yjs';
import * as y from './yjsDoc';
import { canonicalSpaces, sameTree } from './canonicalSpaces';
import type { SavedSpace, SavedTab } from '~src/types';

const tab = (id: string, order = 0): SavedTab => ({ id, url: 'https://x.test/' + id, title: id, favicon: '', order });
const tree = (tabs: SavedTab[] = [tab('t1')]): SavedSpace[] => ([
  { id: 's1', name: 'S1', order: 0, projects: [
    { id: 'p1', name: 'P1', order: 0, categories: [
      { id: 'c1', name: 'C1', order: 0, groups: [{ id: 'g1', name: 'G1', order: 0, tabs }] },
    ] },
  ] },
]);
const tabsOf = (spaces: SavedSpace[]) => spaces[0].projects[0].categories[0].groups[0].tabs.map(t => t.id);

/** A second context (another new tab, the popup or the worker) holding its own copy of the doc. */
function peerOf(): Y.Doc {
  const peer = new Y.Doc();
  Y.applyUpdate(peer, Y.encodeStateAsUpdate(y.doc));
  return peer;
}
function peerAddTab(peer: Y.Doc, t: SavedTab) {
  const g = (peer.getArray<Y.Map<unknown>>('spaces').get(0).get('projects') as Y.Array<Y.Map<unknown>>).get(0);
  const group = ((g.get('categories') as Y.Array<Y.Map<unknown>>).get(0).get('groups') as Y.Array<Y.Map<unknown>>).get(0);
  const m = new Y.Map<unknown>();
  for (const [k, v] of Object.entries(t)) m.set(k, v);
  (group.get('tabs') as Y.Array<Y.Map<unknown>>).push([m]);
}

beforeEach(async () => {
  await y.clearState();
  y.setSpaces(tree());
});

describe('applySpaces keeps what other contexts save meanwhile', () => {
  it('a tab saved in another context survives a sync result applied here', () => {
    const peer = peerOf();
    peerAddTab(peer, tab('saved-elsewhere', 1));
    // A sync result arrives here before the peer's save does (renamed space).
    const result = tree();
    result[0].name = 'Renamed on the server';
    y.applySpaces(result);
    Y.applyUpdate(y.doc, Y.encodeStateAsUpdate(peer));
    expect(y.getSpaces()[0].name).toBe('Renamed on the server');
    expect(tabsOf(y.getSpaces())).toEqual(['t1', 'saved-elsewhere']);
  });

  it('the old whole-tree replace lost that tab (the bug this guards)', () => {
    const peer = peerOf();
    peerAddTab(peer, tab('saved-elsewhere', 1));
    const result = tree();
    result[0].name = 'Renamed on the server';
    y.setSpaces(result);
    Y.applyUpdate(y.doc, Y.encodeStateAsUpdate(peer));
    expect(tabsOf(y.getSpaces())).toEqual(['t1']);
  });

  it('touches nothing when the target equals the doc', () => {
    let updates = 0;
    const count = () => { updates++; };
    y.doc.on('update', count);
    y.applySpaces(y.getSpaces());
    y.doc.off('update', count);
    expect(updates).toBe(0);
  });

  it('removes a second copy of an id', () => {
    // What two contexts rewriting the tree at once used to leave behind.
    y.spacesArray.push([y.spacesArray.get(0).clone()]);
    expect(y.getSpaces()).toHaveLength(2);
    y.applySpaces(tree());
    expect(y.getSpaces().map(s => s.id)).toEqual(['s1']);
  });

  it('inserts, deletes, moves between parents and reorders', () => {
    const target = tree([tab('t2', 0), tab('t1', 1)]);
    target[0].projects[0].categories[0].groups.push({ id: 'g2', name: 'G2', order: 1, color: 'blue', tabs: [tab('t3')] });
    y.applySpaces(target);
    expect(sameTree(y.getSpaces(), target)).toBe(true);
    const moved = tree([tab('t2')]);
    moved[0].projects[0].categories[0].groups.push({ id: 'g2', name: 'G2', order: 1, tabs: [tab('t3'), tab('t1', 1)] });
    y.applySpaces(moved);
    expect(sameTree(y.getSpaces(), moved)).toBe(true);
    expect(y.getSpaces()[0].projects[0].categories[0].groups[1].color).toBeUndefined();
  });
});

describe('canonicalSpaces', () => {
  it('puts lists in display order and renumbers order by position', () => {
    const t = tree([tab('a', 0), tab('b', 1)]);
    t[0].projects[0].categories[0].groups.push({ id: 'new', name: 'New', order: -1, tabs: [] });
    const c = canonicalSpaces(t);
    expect(c[0].projects[0].categories[0].groups.map(g => [g.id, g.order])).toEqual([['new', 0], ['g1', 1]]);
  });

  it('folds a duplicated group into its first copy, keeping every tab', () => {
    const t = tree([tab('a')]);
    t[0].projects[0].categories[0].groups.push({ id: 'g1', name: 'G1', order: 0, tabs: [tab('b', 1)] });
    expect(tabsOf(canonicalSpaces(t))).toEqual(['a', 'b']);
    expect(canonicalSpaces(t)[0].projects[0].categories[0].groups).toHaveLength(1);
  });

  it('treats trees that show the same as equal', () => {
    const raw = tree();
    raw[0].projects[0].categories[0].groups[0].order = -1;
    expect(sameTree(raw, canonicalSpaces(raw))).toBe(true);
  });
});

describe('catchUpFromStorage', () => {
  it('brings in what another context persisted', async () => {
    const peer = peerOf();
    peerAddTab(peer, tab('persisted-elsewhere', 1));
    const stored: Record<string, unknown> = {
      [y.PERSIST_KEY]: { version: 1, origin: 'page', data: Array.from(Y.encodeStateAsUpdate(peer)) },
    };
    vi.mocked(chrome.storage.local.get).mockImplementationOnce(async (key: any) => ({ [key]: stored[key] }));
    await y.catchUpFromStorage();
    expect(tabsOf(y.getSpaces())).toEqual(['t1', 'persisted-elsewhere']);
  });
});
