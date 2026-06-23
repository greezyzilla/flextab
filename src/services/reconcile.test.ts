import { describe, it, expect, vi } from 'vitest';

// syncEngine imports stores/WS at module load; stub the ones the pure fns touch.
vi.mock('~src/store/useSavedSpacesStore', () => ({ ensureDefaultData: vi.fn(), syncActiveSelection: vi.fn() }));
vi.mock('~src/store/useSyncConflict', () => ({ useSyncConflict: { getState: () => ({ open: vi.fn(), close: vi.fn() }) } }));

import { decideReconciliation, resolveChoice, spacesSignature } from './syncEngine';
import type { SavedSpace } from '~src/types';

const tab = (id: string, url = 'u') => ({ id, url, title: 't', favicon: '', order: 0 });
const space = (id: string, name: string, tabs: ReturnType<typeof tab>[] = []): SavedSpace => ({
  id, name, order: 0,
  projects: [{ id: id + 'p', name: 'P', order: 0, categories: [{ id: id + 'c', name: 'C', order: 0, groups: [{ id: id + 'g', name: 'G', order: 0, tabs }] }] }],
});

const withTabs = [space('s', 'Work', [tab('t1')])];
const empty = [space('e', 'Personal', [])];

describe('decideReconciliation', () => {
  it('explicit login + both sides have tabs → conflict', () => {
    expect(decideReconciliation(withTabs, [space('l', 'Research', [tab('t2')])], true)).toEqual({ kind: 'conflict' });
  });

  it('explicit login but local empty → take server (no prompt)', () => {
    const d = decideReconciliation(withTabs, empty, true);
    expect(d.kind).toBe('apply');
    expect(d.kind === 'apply' && d.spaces).toEqual(withTabs);
  });

  it('explicit login but server empty → keep local (upload guest data)', () => {
    const local = [space('l', 'Research', [tab('t2')])];
    const d = decideReconciliation([], local, true);
    expect(d).toEqual({ kind: 'apply', spaces: local });
  });

  it('returning session (not fresh) + both have tabs → merge, never prompt', () => {
    const local = [space('l', 'Research', [tab('t2')])];
    const d = decideReconciliation(withTabs, local, false);
    expect(d.kind).toBe('apply');
    expect(d.kind === 'apply' && d.spaces.map(s => s.id).sort()).toEqual(['l', 's']);
  });

  it('both empty → apply (local placeholder, no conflict)', () => {
    const d = decideReconciliation([], empty, true);
    expect(d.kind).toBe('apply');
  });
});

describe('resolveChoice', () => {
  const server = withTabs;
  const local = [space('l', 'Research', [tab('t2')])];

  it('merge → union of both', () => {
    expect(resolveChoice('merge', server, local).map(s => s.id).sort()).toEqual(['l', 's']);
  });
  it('server → account data only', () => {
    expect(resolveChoice('server', server, local)).toEqual(server);
  });
  it('local → this device only', () => {
    expect(resolveChoice('local', server, local)).toEqual(local);
  });
});

describe('spacesSignature', () => {
  it('is stable for identical content', () => {
    expect(spacesSignature(withTabs)).toBe(spacesSignature([space('s', 'Work', [tab('t1')])]));
  });

  it('ignores favicon changes (avoids a needless rewrite/loop)', () => {
    const a = [space('s', 'Work', [{ ...tab('t1'), favicon: 'data:a' }])];
    const b = [space('s', 'Work', [{ ...tab('t1'), favicon: 'data:DIFFERENT' }])];
    expect(spacesSignature(a)).toBe(spacesSignature(b));
  });

  it('changes when a tab is added', () => {
    const a = [space('s', 'Work', [tab('t1')])];
    const b = [space('s', 'Work', [tab('t1'), tab('t2')])];
    expect(spacesSignature(a)).not.toBe(spacesSignature(b));
  });

  it('changes when a tab url changes', () => {
    const a = [space('s', 'Work', [tab('t1', 'old')])];
    const b = [space('s', 'Work', [tab('t1', 'new')])];
    expect(spacesSignature(a)).not.toBe(spacesSignature(b));
  });
});
