import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as y from './yjsDoc';
import type * as Y from 'yjs';
import type { SavedSpace } from '~src/types';

const tab = (id: string) => ({ id, url: 'u' + id, title: id, favicon: '', order: 0 });
const tree = (): SavedSpace[] => ([
  {
    id: 's1', name: 'S1', order: 0, projects: [
      { id: 'p1', name: 'P1', order: 0, categories: [
        { id: 'c1', name: 'C1', order: 0, groups: [
          { id: 'g1', name: 'G1', order: 0, tabs: [tab('t1'), tab('t2')] },
          { id: 'g2', name: 'G2', order: 1, tabs: [tab('t3')] },
        ] },
        { id: 'c2', name: 'C2', order: 1, groups: [] },
      ] },
      { id: 'p2', name: 'P2', order: 1, categories: [{ id: 'c3', name: 'C3', order: 0, groups: [] }] },
    ],
  },
  { id: 's2', name: 'S2', order: 1, projects: [{ id: 'p3', name: 'P3', order: 0, categories: [{ id: 'c4', name: 'C4', order: 0, groups: [{ id: 'g3', name: 'G3', order: 0, tabs: [] }] }] }] },
]);

const tabIds = (g: { tabs: { id: string }[] }) => g.tabs.map(t => t.id);
function group(spaces: SavedSpace[], sId: string, pId: string, cId: string, gId: string) {
  return spaces.find(s => s.id === sId)!.projects.find(p => p.id === pId)!.categories.find(c => c.id === cId)!.groups.find(g => g.id === gId)!;
}

beforeEach(async () => {
  await y.clearState();
  y.setSpaces(tree());
});

describe('getSpaces / setSpaces', () => {
  it('round-trips the tree', () => {
    expect(y.getSpaces().map(s => s.id)).toEqual(['s1', 's2']);
    expect(tabIds(group(y.getSpaces(), 's1', 'p1', 'c1', 'g1'))).toEqual(['t1', 't2']);
  });

  it.each(["projects", "categories", "groups", "tabs"])(
    "preserves the live document and emits no update when replacement has invalid %s",
    (field) => {
      const invalid: any = tree();
      const parent = field === "projects" ? invalid[0]
        : field === "categories" ? invalid[0].projects[0]
        : field === "groups" ? invalid[0].projects[0].categories[0]
        : invalid[0].projects[0].categories[0].groups[0];
      delete parent[field];
      const before = y.getSpaces();
      const bytes = y.encodeState();
      const update = vi.fn();
      y.doc.on("update", update);
      try {
        // A valid item before the malformed item must not be partially imported.
        expect(() => y.setSpaces([{ id: "new", name: "New", projects: [] }, ...invalid])).toThrow();
        expect(y.getSpaces()).toEqual(before);
        expect(y.encodeState()).toEqual(bytes);
        expect(update).not.toHaveBeenCalled();
      } finally {
        y.doc.off("update", update);
      }
    },
  );

  it("publishes only the complete replacement in one update", () => {
    const observed: SavedSpace[][] = [];
    const update = () => { observed.push(y.getSpaces()); };
    y.doc.on("update", update);
    try {
      y.setSpaces([{ id: "replacement", name: "Imported", projects: [] }]);
      expect(observed).toHaveLength(1);
      expect(observed[0].map(s => s.id)).toEqual(["replacement"]);
    } finally {
      y.doc.off("update", update);
    }
  });
});

describe('find helpers', () => {
  it('finds nested entities and returns null when absent', () => {
    expect(y.findSpace('s1')).not.toBeNull();
    expect(y.findSpace('nope')).toBeNull();
    expect(y.findProject('s1', 'p1')).not.toBeNull();
    expect(y.findProject('s1', 'nope')).toBeNull();
    expect(y.findProject('nope', 'p1')).toBeNull();
    expect(y.findCategory('s1', 'p1', 'c1')).not.toBeNull();
    expect(y.findCategory('s1', 'p1', 'nope')).toBeNull();
    expect(y.findGroup('s1', 'p1', 'c1', 'g1')).not.toBeNull();
    expect(y.findGroup('s1', 'p1', 'c1', 'nope')).toBeNull();
  });
});

describe('space mutations', () => {
  it('add / update / remove', () => {
    y.addSpace({ id: 's3', name: 'S3', order: 2, projects: [] });
    expect(y.getSpaces().map(s => s.id)).toContain('s3');
    y.updateSpace({ id: 's3', name: 'S3-renamed', order: 2, projects: [], color: '#fff', abbreviation: 'S3', icon: 'i' });
    expect(y.getSpaces().find(s => s.id === 's3')!.name).toBe('S3-renamed');
    y.updateSpace({ id: 'ghost', name: 'x', order: 0, projects: [] }); // no-op
    y.removeSpace('s3');
    expect(y.getSpaces().map(s => s.id)).not.toContain('s3');
  });
});

describe('project / category / group mutations', () => {
  it('project add/update/remove (and guards)', () => {
    y.addProject('s1', { id: 'pX', name: 'PX', order: 9, categories: [] });
    y.addProject('nope', { id: 'pY', name: 'PY', order: 0, categories: [] }); // guard
    expect(y.findProject('s1', 'pX')).not.toBeNull();
    y.updateProject('s1', { id: 'pX', name: 'PX2', order: 9, categories: [] });
    y.updateProject('s1', { id: 'ghost', name: 'x', order: 0, categories: [] }); // guard
    y.removeProject('s1', 'pX');
    expect(y.findProject('s1', 'pX')).toBeNull();
  });
  it('category add/update/remove (and guards)', () => {
    y.addCategory('s1', 'p1', { id: 'cX', name: 'CX', order: 9, groups: [] });
    y.addCategory('s1', 'nope', { id: 'cY', name: 'CY', order: 0, groups: [] }); // guard
    y.updateCategory('s1', 'p1', { id: 'cX', name: 'CX2', order: 9, groups: [] });
    y.removeCategory('s1', 'p1', 'cX');
    expect(y.findCategory('s1', 'p1', 'cX')).toBeNull();
  });
  it('group add/update/remove (and guards)', () => {
    y.addGroup('s1', 'p1', 'c1', { id: 'gX', name: 'GX', order: 9, tabs: [] });
    y.addGroup('s1', 'p1', 'nope', { id: 'gY', name: 'GY', order: 0, tabs: [] }); // guard
    y.updateGroup('s1', 'p1', 'c1', { id: 'gX', name: 'GX2', order: 9, tabs: [tab('z')] });
    expect(tabIds(group(y.getSpaces(), 's1', 'p1', 'c1', 'gX'))).toEqual(['z']);
    y.removeGroup('s1', 'p1', 'c1', 'gX');
    expect(y.findGroup('s1', 'p1', 'c1', 'gX')).toBeNull();
  });
});

describe('group colour (TASK-18)', () => {
  it('round-trips through setSpaces / getSpaces and drops unknown values', () => {
    const t = tree();
    t[0].projects[0].categories[0].groups[0].color = 'pink';
    (t[0].projects[0].categories[0].groups[1] as { color?: string }).color = 'magenta';
    y.setSpaces(t);
    const spaces = y.getSpaces();
    expect(group(spaces, 's1', 'p1', 'c1', 'g1').color).toBe('pink');
    expect(group(spaces, 's1', 'p1', 'c1', 'g2')).not.toHaveProperty('color');
  });
  it('updateGroup sets, changes and clears the colour', () => {
    const g = () => group(y.getSpaces(), 's1', 'p1', 'c1', 'g1');
    y.updateGroup('s1', 'p1', 'c1', { ...g(), color: 'yellow' });
    expect(g().color).toBe('yellow');
    y.updateGroup('s1', 'p1', 'c1', { ...g(), color: 'cyan' });
    expect(g().color).toBe('cyan');
    const plain = { ...g() };
    delete plain.color;
    y.updateGroup('s1', 'p1', 'c1', plain);
    expect(g()).not.toHaveProperty('color');
    // Clearing an uncoloured group is a no-op.
    y.updateGroup('s1', 'p1', 'c1', plain);
    expect(g()).not.toHaveProperty('color');
  });
});

describe('tab mutations', () => {
  it('add / addBatch / update / remove (and guards)', () => {
    y.addTab('s1', 'p1', 'c1', 'g2', tab('t4'));
    y.addTab('s1', 'p1', 'c1', 'nope', tab('z')); // guard
    expect(tabIds(group(y.getSpaces(), 's1', 'p1', 'c1', 'g2'))).toEqual(['t3', 't4']);
    y.addTabsBatch('s1', 'p1', 'c1', 'g2', [tab('t5'), tab('t6')]);
    y.addTabsBatch('s1', 'p1', 'c1', 'nope', [tab('z')]); // guard
    expect(tabIds(group(y.getSpaces(), 's1', 'p1', 'c1', 'g2'))).toEqual(['t3', 't4', 't5', 't6']);
    y.updateTab('s1', 'p1', 'c1', 'g1', { ...tab('t1'), title: 'renamed', url: 'new' });
    y.updateTab('s1', 'p1', 'c1', 'g1', tab('ghost')); // guard
    y.removeTab('s1', 'p1', 'c1', 'g1', 't1');
    expect(tabIds(group(y.getSpaces(), 's1', 'p1', 'c1', 'g1'))).toEqual(['t2']);
  });
});

describe('reorder + cross-boundary moves', () => {
  it('reorderInArray reindexes', () => {
    const found = y.findSpace('s1')!;
    const projects = found.map.get('projects') as any;
    y.reorderInArray(projects, 0, 1); // p1 ↔ p2
    expect(y.getSpaces().find(s => s.id === 's1')!.projects.map(p => p.id)).toEqual(['p2', 'p1']);
  });
  it('moveTabBetweenGroups moves within a category', () => {
    y.moveTabBetweenGroups('s1', 'p1', 'c1', 'g1', 'g2', 't1', 0);
    expect(tabIds(group(y.getSpaces(), 's1', 'p1', 'c1', 'g2'))).toContain('t1');
    expect(tabIds(group(y.getSpaces(), 's1', 'p1', 'c1', 'g1'))).not.toContain('t1');
    y.moveTabBetweenGroups('s1', 'p1', 'c1', 'g1', 'nope', 'x'); // guard
  });
  it('moveGroupToCategory moves a group across categories', () => {
    y.moveGroupToCategory('s1', 'p1', 'c1', 'g2', 's1', 'p1', 'c2');
    expect(y.findGroup('s1', 'p1', 'c2', 'g2')).not.toBeNull();
    expect(y.findGroup('s1', 'p1', 'c1', 'g2')).toBeNull();
    y.moveGroupToCategory('s1', 'p1', 'nope', 'g1', 's1', 'p1', 'c2'); // guard
  });
  it('moveTabCrossBoundary moves a tab across spaces', () => {
    y.moveTabCrossBoundary('s1', 'p1', 'c1', 'g1', 't2', 's2', 'p3', 'c4', 'g3');
    expect(tabIds(group(y.getSpaces(), 's2', 'p3', 'c4', 'g3'))).toContain('t2');
    y.moveTabCrossBoundary('s1', 'p1', 'c1', 'g1', 'ghost', 's2', 'p3', 'c4', 'g3'); // guard
  });
  it('moveCategoryToProject moves a category', () => {
    y.moveCategoryToProject('s1', 'p1', 'c2', 's1', 'p2');
    expect(y.findCategory('s1', 'p2', 'c2')).not.toBeNull();
    y.moveCategoryToProject('s1', 'nope', 'c1', 's1', 'p2'); // guard
  });
  it('moveProjectToSpace moves a project', () => {
    y.moveProjectToSpace('s1', 'p2', 's2');
    expect(y.findProject('s2', 'p2')).not.toBeNull();
    y.moveProjectToSpace('s1', 'ghost', 's2'); // guard
  });
});

describe('binary state + persistence', () => {
  it('encodeState / applyUpdate / mergeRemoteState round-trip into a fresh doc', () => {
    const state = y.encodeState();
    expect(state).toBeInstanceOf(Uint8Array);
    y.applyUpdate(state);       // idempotent
    y.mergeRemoteState(state);  // idempotent
    expect(y.getSpaces().length).toBe(2);
  });

  it('persistState writes the encoded doc', async () => {
    await y.persistState();
    expect(chrome.storage.local.set).toHaveBeenCalledWith(expect.objectContaining({ flextab_yjs_state: expect.objectContaining({ version: 1, origin: "page", data: expect.any(Array) }) }));
  });

  it('persistState single-flights concurrent calls and coalesces trailing writes', async () => {
    let resolveSet: (() => void) | null = null;
    let setCalls = 0;
    ;(chrome.storage.local.set as any).mockImplementation(() => {
      setCalls++
      return new Promise<void>((r) => {
        // First call blocks; later coalesced flush can complete immediately
        if (setCalls === 1) resolveSet = r
        else r()
      })
    })

    const p1 = y.persistState()
    const p2 = y.persistState()
    const p3 = y.persistState()
    // Only one write in flight while blocked
    expect(setCalls).toBe(1)

    resolveSet!()
    await Promise.all([p1, p2, p3])
    // Trailing coalesced write after the flight (queued by p2/p3)
    expect(setCalls).toBe(2)
  });

  it('loadPersistedState applies a stored update and reports true/false', async () => {
    const bytes = Array.from(y.encodeState());
    (chrome.storage.local.get as any).mockResolvedValue({ flextab_yjs_state: bytes });
    expect(await y.loadPersistedState()).toBe(true);
    (chrome.storage.local.get as any).mockResolvedValue({});
    expect(await y.loadPersistedState()).toBe(false);
  });

  it('loadPersistedState rejects storage errors without changing the live doc', async () => {
    const before = y.encodeState();
    (chrome.storage.local.get as any).mockRejectedValue(new Error('x'));
    await expect(y.loadPersistedState()).rejects.toThrow('x');
    expect(y.encodeState()).toEqual(before);
  });

  it.each([null, { version: 2, data: [0, 0] }, [255]])('rejects corrupt storage %j without applying it', async value => {
    const before = y.encodeState();
    vi.mocked(chrome.storage.local.get).mockImplementation(async () => ({ [y.PERSIST_KEY]: value }));
    await expect(y.loadPersistedState()).rejects.toThrow();
    expect(y.encodeState()).toEqual(before);
  });

  it.each(['flextab_merge_base', 'flextab_sync_revision', 'flextab_landed_snapshot'])('rejects absent workspace with surviving %s', async key => {
    vi.mocked(chrome.storage.local.get).mockImplementation(async requested => requested === key ? { [key]: [] } : {});
    await expect(y.loadPersistedState()).rejects.toThrow('sync history remains');
  });

  it('clearState empties the doc and removes storage', async () => {
    await y.clearState();
    expect(y.getSpaces()).toEqual([]);
    expect(chrome.storage.local.remove).toHaveBeenCalledWith('flextab_yjs_state');
  });

  it('encodeSpacesAsStorage / decodeSpacesFromStorage round-trip tab tree', () => {
    const spaces = y.getSpaces();
    const blob = y.encodeSpacesAsStorage(spaces);
    expect(Array.isArray(blob)).toBe(true);
    expect(blob.length).toBeGreaterThan(0);
    const back = y.decodeSpacesFromStorage(blob);
    expect(y.lightSpacesSig(back)).toBe(y.lightSpacesSig(spaces));
  });

  it('persistSpacesSnapshot writes an encoded blob under PERSIST_KEY', async () => {
    const spaces = y.getSpaces();
    await y.persistSpacesSnapshot(spaces);
    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({ [y.PERSIST_KEY]: expect.objectContaining({ version: 1, origin: "snapshot", data: expect.any(Array) }) }),
    );
  });

  it('applyExternalPersistUpdate snapshot origin replaces the live doc', () => {
    const spaces = y.getSpaces();
    const blob = y.encodeSpacesAsStorage(spaces);
    expect(y.applyExternalPersistUpdate(blob, 'snapshot')).toBe(false); // same content

    const other = y.decodeSpacesFromStorage(blob);
    if (other[0]?.projects[0]?.categories[0]?.groups[0]?.tabs[0]) {
      other[0].projects[0].categories[0].groups[0].tabs[0].url = 'https://changed.example';
    }
    const changedBlob = y.encodeSpacesAsStorage(other);
    expect(y.applyExternalPersistUpdate(changedBlob, 'snapshot')).toBe(true);
    expect(y.getSpaces()[0].projects[0].categories[0].groups[0].tabs[0].url).toBe(
      'https://changed.example',
    );
  });

  it('page-origin external update CRDT-merges a peer tab add (FE-A2)', async () => {
    const Y = await import('yjs');

    // Peer starts from the same history as the live module doc, then adds a tab.
    const peer = new Y.Doc();
    Y.applyUpdate(peer, y.encodeState());

    const spaces = peer.getArray<Y.Map<unknown>>('spaces');
    const s0 = spaces.get(0);
    const projects = s0.get('projects') as Y.Array<Y.Map<unknown>>;
    const cats = projects.get(0).get('categories') as Y.Array<Y.Map<unknown>>;
    const groups = cats.get(0).get('groups') as Y.Array<Y.Map<unknown>>;
    const tabs = groups.get(0).get('tabs') as Y.Array<Y.Map<unknown>>;
    peer.transact(() => {
      const m = new Y.Map<unknown>();
      m.set('id', 'peer-tab');
      m.set('url', 'https://peer.example');
      m.set('title', 'Peer');
      m.set('favicon', '');
      m.set('order', tabs.length);
      tabs.push([m]);
    });

    const peerBlob = Array.from(Y.encodeStateAsUpdate(peer));
    peer.destroy();

    const beforeIds = group(y.getSpaces(), 's1', 'p1', 'c1', 'g1').tabs.map((t) => t.id);
    expect(beforeIds).toEqual(['t1', 't2']);

    expect(y.applyExternalPersistUpdate(peerBlob, 'page')).toBe(true);

    const afterIds = group(y.getSpaces(), 's1', 'p1', 'c1', 'g1').tabs.map((t) => t.id).sort();
    // Live still has t1,t2 and gained peer-tab — not replaced/wiped.
    expect(afterIds).toEqual(['peer-tab', 't1', 't2']);
  });
});
