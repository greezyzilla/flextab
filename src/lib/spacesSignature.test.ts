import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import type { SavedSpace } from '~src/types';
import { spacesSignature } from './spacesSignature';
import * as y from './yjsDoc';

const fixture = (): SavedSpace[] => [{
  id: 's', name: 'Space', icon: 'folder', color: 'red', abbreviation: 'SP', order: 0,
  projects: [{ id: 'p', name: 'Project', order: 0, categories: [{
    id: 'c', name: 'Category', order: 0, groups: [{
      id: 'g', name: 'Group', order: 0,
      tabs: [{ id: 't', url: 'https://example.com', title: 'Title', favicon: 'data:old', order: 0 }],
    }],
  }] }],
}];

function nodes(tree: SavedSpace[]): Record<string, any>[] {
  const s = tree[0], p = s.projects[0], c = p.categories[0], g = c.groups[0];
  return [s, p, c, g, g.tabs[0]];
}
const fields = [
  ['id', 'name', 'icon', 'color', 'abbreviation', 'order'],
  ['id', 'name', 'order'], ['id', 'name', 'order'], ['id', 'name', 'order'],
  ['id', 'url', 'title', 'favicon', 'order'],
].flatMap((names, level) => names.map(field => ({ level, field })));

beforeEach(async () => {
  await y.persistState();
  await y.clearState();
  y.setSpaces(fixture());
  vi.clearAllMocks();
});

describe('complete persisted workspace signature', () => {
  it.each(fields)('detects and applies level $level field $field without changing other fields', ({ level, field }) => {
    const before = y.getSpaces();
    const next = structuredClone(before);
    nodes(next)[level][field] = field === 'order' ? 7 : 'changed';
    expect(spacesSignature(next)).not.toBe(spacesSignature(before));
    const update = vi.fn();
    y.doc.on('update', update);
    try {
      const blob = y.encodeSpacesAsStorage(next);
      expect(y.applyExternalPersistUpdate(blob, 'snapshot')).toBe(true);
      expect(y.getSpaces()).toEqual(next);
      expect(update).toHaveBeenCalledTimes(1);
      // Replayed, fully converged snapshots must not rewrite or repersist.
      expect(y.applyExternalPersistUpdate(blob, 'snapshot')).toBe(false);
      expect(update).toHaveBeenCalledTimes(1);
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
    } finally {
      y.doc.off('update', update);
    }
  });

  it.each([0, 1, 2, 3, 4])('detects array reordering at level %i even when order values are unchanged', (level) => {
    const before = fixture();
    const lists = [before, before[0].projects, before[0].projects[0].categories,
      before[0].projects[0].categories[0].groups, before[0].projects[0].categories[0].groups[0].tabs];
    const list = lists[level] as any[];
    list.push({ ...structuredClone(list[0]), id: 'second', order: 0 });
    const signature = spacesSignature(before);
    list.reverse();
    expect(spacesSignature(before)).not.toBe(signature);
    expect(list.map(x => x.order)).toEqual([0, 0]);
  });

  it('normalizes absent optional defaults and ignores object key insertion order', () => {
    const a = fixture();
    delete a[0].icon; delete a[0].color; delete a[0].abbreviation;
    nodes(a).forEach(node => { delete node.order; });
    const b = structuredClone(a);
    b[0].icon = ''; b[0].color = ''; b[0].abbreviation = '';
    nodes(b).forEach(node => { node.order = 0; });
    const reorderKeys = (value: any): any => Array.isArray(value) ? value.map(reorderKeys)
      : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).reverse().map(([key, v]) => [key, reorderKeys(v)])) : value;
    expect(spacesSignature(a)).toBe(spacesSignature(reorderKeys(b)));
    expect(spacesSignature(a)).toBe(spacesSignature(y.decodeSpacesFromStorage(y.encodeSpacesAsStorage(a))));
  });

  it('detects and applies a group colour, set and cleared', () => {
    const before = y.getSpaces();
    const coloured = structuredClone(before);
    coloured[0].projects[0].categories[0].groups[0].color = 'pink';
    expect(spacesSignature(coloured)).not.toBe(spacesSignature(before));
    expect(y.applyExternalPersistUpdate(y.encodeSpacesAsStorage(coloured), 'snapshot')).toBe(true);
    expect(y.getSpaces()).toEqual(coloured);
    expect(y.applyExternalPersistUpdate(y.encodeSpacesAsStorage(before), 'snapshot')).toBe(true);
    expect(y.getSpaces()).toEqual(before);
  });

  it.each(['icon', 'color', 'abbreviation'])('detects clearing optional metadata: %s', (field) => {
    const before = fixture();
    const after = structuredClone(before);
    delete (after[0] as any)[field];
    expect(spacesSignature(before)).not.toBe(spacesSignature(after));
  });

  it('persists peer metadata together with an unsaved local edit, without repeated writes', async () => {
    const peer = new Y.Doc();
    try {
      Y.applyUpdate(peer, y.encodeState());
      peer.getArray<Y.Map<unknown>>('spaces').get(0).set('color', 'blue');
      // Independent edit in the live doc after the peer forked its history.
      y.findGroup('s', 'p', 'c', 'g')!.map.set('name', 'Local unsynced edit');
      const blob = Array.from(Y.encodeStateAsUpdate(peer));
      expect(y.applyExternalPersistUpdate(blob, 'page')).toBe(true);
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);
      const stored = vi.mocked(chrome.storage.local.set).mock.calls[0][0];
      const durable = y.decodeSpacesFromStorage(stored[y.PERSIST_KEY]);
      expect(durable[0].color).toBe('blue');
      expect(durable[0].projects[0].categories[0].groups[0].name).toBe('Local unsynced edit');
      expect(y.applyExternalPersistUpdate(blob, 'page')).toBe(false);
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);
    } finally {
      peer.destroy();
    }
  });
});
