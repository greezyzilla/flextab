import { describe, it, expect, vi } from 'vitest';

// syncEngine imports stores/WS at module load; stub the ones the pure fns touch.
vi.mock('~src/store/useSavedSpacesStore', () => ({ ensureDefaultData: vi.fn(), syncActiveSelection: vi.fn() }));
vi.mock('~src/store/useSyncConflict', () => ({ useSyncConflict: { getState: () => ({ open: vi.fn(), close: vi.fn() }) } }));

import { decideReconciliation, decideReconciliation3, resolveChoice, spacesSignature } from './syncEngine';
import type { SavedSpace } from '~src/types';

const tab = (id: string, url = 'u') => ({ id, url, title: 't', favicon: '', order: 0 });
const space = (id: string, name: string, tabs: ReturnType<typeof tab>[] = []): SavedSpace => ({
  id, name, order: 0,
  projects: [{ id: id + 'p', name: 'P', order: 0, categories: [{ id: id + 'c', name: 'C', order: 0, groups: [{ id: id + 'g', name: 'G', order: 0, tabs }] }] }],
});

const withTabs = [space('s', 'Work', [tab('t1')])];
const empty = [space('e', 'Personal', [])];

describe('decideReconciliation over the plan cap (TASK-33)', () => {
  const many = [space('l', 'Research', [tab('a'), tab('b'), tab('c')])];

  it('fresh login, empty account, more local tabs than the cap → over-cap notice first', () => {
    expect(decideReconciliation([], many, true, false, 2)).toEqual({ kind: 'over-cap', spaces: many, tabs: 3, cap: 2 });
    expect(decideReconciliation(empty, many, true, false, 2).kind).toBe('over-cap');
  });

  it('applies as before when the tabs fit, the cap is unknown or unlimited', () => {
    expect(decideReconciliation([], many, true, false, 3)).toEqual({ kind: 'apply', spaces: many });
    expect(decideReconciliation([], many, true, false, undefined)).toEqual({ kind: 'apply', spaces: many });
    expect(decideReconciliation([], many, true, false, 0)).toEqual({ kind: 'apply', spaces: many });
  });

  it('only on a fresh login: later reconciles go on to the push and its Sync paused state', () => {
    expect(decideReconciliation([], many, false, false, 2)).toEqual({ kind: 'apply', spaces: many });
  });

  it('keeps the choice dialog when there is a choice to make (it carries its own cap note)', () => {
    expect(decideReconciliation(withTabs, many, true, false, 2)).toEqual({ kind: 'conflict' });
    expect(decideReconciliation([], many, true, true, 2)).toEqual({ kind: 'conflict' });
  });

  it('passes the cap through without a merge base and ignores it with one', () => {
    expect(decideReconciliation3(null, [], many, true, false, 2).kind).toBe('over-cap');
    expect(decideReconciliation3(many, many, many, true, false, 2).kind).toBe('apply');
  });
});

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

describe('decideReconciliation after a kept sign-out (TASK-11)', () => {
  const local = [space('l', 'Kept', [tab('k')])];
  it('asks even when the account is empty', () => {
    expect(decideReconciliation([], local, true, true)).toEqual({ kind: 'conflict' });
    expect(decideReconciliation3(null, [], local, true, true)).toEqual({ kind: 'conflict' });
  });
  it('has nothing to ask when the device holds no tabs', () => {
    expect(decideReconciliation([], [space('e', 'Empty', [])], true, true).kind).toBe('apply');
  });
});

describe('decideReconciliation3 (with a merge-base)', () => {
  it('no base → falls back to 2-way (fresh login + both real → conflict)', () => {
    const d = decideReconciliation3(null, withTabs, [space('l', 'Research', [tab('t2')])], true);
    expect(d).toEqual({ kind: 'conflict' });
  });

  it('base present, change on one side only → apply, no conflict', () => {
    const base = [space('s', 'Work', [tab('t1')])];
    const server = [space('s', 'Work', [tab('t1'), tab('t2')])]; // server added a tab
    const local = base;
    const d = decideReconciliation3(base, server, local, false);
    expect(d.kind).toBe('apply');
  });

  it('base present, delete on local while server unchanged → apply, no resurrect', () => {
    const base = [space('s', 'Work', [tab('t1')]), space('x', 'Old', [tab('t2')])];
    const server = base;
    const local = [space('s', 'Work', [tab('t1')])]; // deleted x
    const d = decideReconciliation3(base, server, local, false);
    expect(d.kind).toBe('apply');
    expect(d.kind === 'apply' && d.spaces.map(s => s.id).sort()).toEqual(['s']);
  });

  it('base present, same field edited on both sides → item-conflict', () => {
    const base = [space('s', 'Work', [tab('t1')])];
    const server = [space('s', 'Server name', [tab('t1')])];
    const local = [space('s', 'Local name', [tab('t1')])];
    const d = decideReconciliation3(base, server, local, false);
    expect(d.kind).toBe('item-conflict');
    expect(d.kind === 'item-conflict' && d.conflicts.length).toBe(1);
  });

  it('base present, delete vs edit → item-conflict', () => {
    const base = [space('s', 'Work', [tab('t1')]), space('x', 'Old', [tab('t2')])];
    const server = [space('s', 'Work', [tab('t1')])]; // deleted x
    const local = [space('s', 'Work', [tab('t1')]), space('x', 'Old renamed', [tab('t2')])]; // edited x
    const d = decideReconciliation3(base, server, local, false);
    expect(d.kind).toBe('item-conflict');
    expect(d.kind === 'item-conflict' && d.conflicts[0].kind).toBe('delete-edit');
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

  it('detects favicon changes as persisted content', () => {
    const a = [space('s', 'Work', [{ ...tab('t1'), favicon: 'data:a' }])];
    const b = [space('s', 'Work', [{ ...tab('t1'), favicon: 'data:DIFFERENT' }])];
    expect(spacesSignature(a)).not.toBe(spacesSignature(b));
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
