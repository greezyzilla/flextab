import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  useSavedSpacesStore, useActiveSpace, useActiveProject, useActiveCategory, useActiveGroups,
  syncActiveSelection, resetYjsHydration,
} from './useSavedSpacesStore';
import * as yjs from '~src/lib/yjsDoc';
import type { SavedSpace } from '~src/types';

const tab = (id: string) => ({ id, url: 'u' + id, title: id, favicon: '', order: 0 });
const tree = (): SavedSpace[] => ([
  { id: 's1', name: 'S1', order: 0, projects: [
    { id: 'p1', name: 'P1', order: 0, categories: [
      { id: 'c1', name: 'C1', order: 0, groups: [{ id: 'g1', name: 'G1', order: 0, tabs: [tab('t1')] }, { id: 'g2', name: 'G2', order: 1, tabs: [] }] },
      { id: 'c2', name: 'C2', order: 1, groups: [] },
    ] },
    { id: 'p2', name: 'P2', order: 1, categories: [{ id: 'c3', name: 'C3', order: 0, groups: [] }] },
  ] },
  { id: 's2', name: 'S2', order: 1, projects: [{ id: 'p3', name: 'P3', order: 0, categories: [{ id: 'c4', name: 'C4', order: 0, groups: [{ id: 'g3', name: 'G3', order: 0, tabs: [] }] }] }] },
]);

const st = () => useSavedSpacesStore.getState();
const ids = () => st().savedSpaces.map(s => s.id);

beforeEach(async () => {
  await yjs.clearState();
  yjs.setSpaces(tree());
  useSavedSpacesStore.setState({ activeSpaceId: null, activeProjectId: null, activeCategoryId: null, expandedProjectIds: [] });
});

describe('active selection', () => {
  it('setActiveSpace cascades to the first project + category', () => {
    st().setActiveSpace('s1');
    expect([st().activeSpaceId, st().activeProjectId, st().activeCategoryId]).toEqual(['s1', 'p1', 'c1']);
    st().setActiveSpace(null);
    expect([st().activeSpaceId, st().activeProjectId, st().activeCategoryId]).toEqual([null, null, null]);
  });

  it('setActiveProject cascades to the first category', () => {
    st().setActiveSpace('s1');
    st().setActiveProject('p2');
    expect([st().activeProjectId, st().activeCategoryId]).toEqual(['p2', 'c3']);
    st().setActiveProject(null);
    expect([st().activeProjectId, st().activeCategoryId]).toEqual([null, null]);
  });

  it('setActiveCategory sets the id', () => {
    st().setActiveCategory('c2');
    expect(st().activeCategoryId).toBe('c2');
  });

  it('toggleExpandedProject adds then removes', () => {
    st().toggleExpandedProject('p1');
    expect(st().expandedProjectIds).toContain('p1');
    st().toggleExpandedProject('p1');
    expect(st().expandedProjectIds).not.toContain('p1');
  });
});

describe('derived selector hooks', () => {
  it('resolve the active space/project/category/groups', () => {
    st().setActiveSpace('s1');
    expect(renderHook(() => useActiveSpace()).result.current?.id).toBe('s1');
    expect(renderHook(() => useActiveProject()).result.current?.id).toBe('p1');
    expect(renderHook(() => useActiveCategory()).result.current?.id).toBe('c1');
    expect(renderHook(() => useActiveGroups()).result.current.map(g => g.id)).toEqual(['g1', 'g2']);
  });

  it('useActiveGroups returns the shared empty array when nothing is selected', () => {
    expect(renderHook(() => useActiveGroups()).result.current).toEqual([]);
  });
});

describe('CRUD delegates to Yjs and keeps the store in sync', () => {
  it('space add/update/remove (+ active reset)', () => {
    st().addSavedSpace({ id: 's3', name: 'S3', order: 2, projects: [] });
    expect(ids()).toContain('s3');
    st().updateSavedSpace({ id: 's3', name: 'S3b', order: 2, projects: [] });
    expect(st().savedSpaces.find(s => s.id === 's3')!.name).toBe('S3b');
    st().setActiveSpace('s3');
    st().removeSavedSpace({ id: 's3', name: 'S3b', order: 2, projects: [] });
    expect(ids()).not.toContain('s3');
    expect(st().activeSpaceId).toBe('s1'); // reset to first remaining
  });

  it('project add/remove (+ active reset)', () => {
    st().setActiveSpace('s1'); st().setActiveProject('p2');
    st().removeSavedProject('s1', { id: 'p2', name: 'P2', order: 1, categories: [] });
    expect(st().activeProjectId).toBe('p1');
    st().addSavedProject('s1', { id: 'pN', name: 'PN', order: 9, categories: [] });
    expect(yjs.findProject('s1', 'pN')).not.toBeNull();
    st().updateSavedProject('s1', { id: 'pN', name: 'PN2', order: 9, categories: [] });
  });

  it('category add/remove (+ active reset)', () => {
    st().setActiveSpace('s1'); st().setActiveCategory('c2');
    st().removeSavedCategory('s1', 'p1', { id: 'c2', name: 'C2', order: 1, groups: [] });
    expect(st().activeCategoryId).toBe('c1');
    st().addSavedCategory('s1', 'p1', { id: 'cN', name: 'CN', order: 9, groups: [] });
    st().updateSavedCategory('s1', 'p1', { id: 'cN', name: 'CN2', order: 9, groups: [] });
    expect(yjs.findCategory('s1', 'p1', 'cN')).not.toBeNull();
  });

  it('group + tab CRUD', () => {
    st().addSavedGroup('s1', 'p1', 'c1', { id: 'gN', name: 'GN', order: 9, tabs: [] });
    st().updateSavedGroup('s1', 'p1', 'c1', { id: 'gN', name: 'GN2', order: 9, tabs: [] });
    st().addSavedTab('s1', 'p1', 'c1', 'gN', tab('tN'));
    st().addSavedTabsBatch('s1', 'p1', 'c1', 'gN', [tab('tA'), tab('tB')]);
    st().updateSavedTab('s1', 'p1', 'c1', 'gN', { ...tab('tN'), title: 'r' });
    st().removeSavedTab('s1', 'p1', 'c1', 'gN', tab('tA'));
    st().removeSavedGroup('s1', 'p1', 'c1', { id: 'gN', name: 'GN2', order: 9, tabs: [] });
    expect(yjs.findGroup('s1', 'p1', 'c1', 'gN')).toBeNull();
  });
});

describe('reorder (with not-found guards) + moves', () => {
  it('reorders at every level', () => {
    st().reorderSpaces(0, 1);
    expect(ids()).toEqual(['s2', 's1']);
    st().reorderProjects('s1', 0, 1);
    st().reorderCategories('s1', 'p1', 0, 1);
    st().reorderGroups('s1', 'p1', 'c1', 0, 1);
    st().reorderTabsInGroup('s1', 'p1', 'c1', 'g1', 0, 0);
    // guards: non-existent parents are no-ops
    st().reorderProjects('nope', 0, 1);
    st().reorderCategories('s1', 'nope', 0, 1);
    st().reorderGroups('s1', 'p1', 'nope', 0, 1);
    st().reorderTabsInGroup('s1', 'p1', 'c1', 'nope', 0, 1);
  });

  it('move actions delegate to Yjs', () => {
    st().moveTabBetweenGroups('s1', 'p1', 'c1', 'g1', 'g2', 't1');
    st().moveGroupToCategory('s1', 'p1', 'c1', 'g2', 's1', 'p1', 'c2');
    st().moveTabCrossBoundary('s2', 'p3', 'c4', 'g3', 'tx', 's1', 'p1', 'c1', 'g1'); // guard (no tx)
    st().moveCategoryToProject('s1', 'p1', 'c2', 's1', 'p2');
    st().moveProjectToSpace('s1', 'p2', 's2');
    expect(yjs.findProject('s2', 'p2')).not.toBeNull();
  });
});

describe('syncActiveSelection', () => {
  it('keeps a valid selection but fixes an invalid one', () => {
    useSavedSpacesStore.setState({ activeSpaceId: 's1', activeProjectId: 'p1', activeCategoryId: 'c1' });
    syncActiveSelection(false);
    expect(st().activeSpaceId).toBe('s1');
    useSavedSpacesStore.setState({ activeSpaceId: 'ghost', activeProjectId: 'ghost', activeCategoryId: 'ghost' });
    syncActiveSelection(false);
    expect([st().activeSpaceId, st().activeProjectId, st().activeCategoryId]).toEqual(['s1', 'p1', 'c1']);
  });

  it('forceFirst selects the first space/project/category', () => {
    useSavedSpacesStore.setState({ activeSpaceId: 's2', activeProjectId: 'p3', activeCategoryId: 'c4' });
    syncActiveSelection(true);
    expect([st().activeSpaceId, st().activeProjectId, st().activeCategoryId]).toEqual(['s1', 'p1', 'c1']);
  });
});

describe('resetYjsHydration', () => {
  it('does not throw', () => {
    expect(() => resetYjsHydration()).not.toThrow();
  });
});
