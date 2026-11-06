import { useState, useEffect } from 'react';
import { DEFAULT_CATEGORY_NAME, DEFAULT_PROJECT_NAME } from "~src/lib/defaultPath";
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { SavedSpace, SavedProject, SavedCategory, SavedGroup, SavedTab } from "../types";
import { v7 as uuidv7 } from "uuid";
import { storage } from './syncStorage';
import type { Array as YArray, Map as YMap } from "yjs";
import * as yjs from '~src/lib/yjsDoc';

const STORE_VERSION = 2;
let yjsHydrated = false;

/** Reset hydration so hydrateYjs() re-runs on next login. */
export function resetYjsHydration() {
  yjsHydrated = false;
}

interface SavedSpacesState {
  savedSpaces: SavedSpace[];
  activeSpaceId: string | null;
  activeProjectId: string | null;
  activeCategoryId: string | null;
  expandedProjectIds: string[];
  lastModified: number;

  setActiveSpace: (id: string | null) => void;
  setActiveProject: (id: string | null) => void;
  setActiveCategory: (id: string | null) => void;
  toggleExpandedProject: (projectId: string) => void;

  addSavedSpace: (space: SavedSpace) => void;
  removeSavedSpace: (space: SavedSpace) => void;
  updateSavedSpace: (space: SavedSpace) => void;
  reorderSpaces: (oldIndex: number, newIndex: number) => void;

  addSavedProject: (spaceId: string, project: SavedProject) => void;
  removeSavedProject: (spaceId: string, project: SavedProject) => void;
  updateSavedProject: (spaceId: string, project: SavedProject) => void;
  reorderProjects: (spaceId: string, oldIndex: number, newIndex: number) => void;

  addSavedCategory: (spaceId: string, projectId: string, category: SavedCategory) => void;
  removeSavedCategory: (spaceId: string, projectId: string, category: SavedCategory) => void;
  updateSavedCategory: (spaceId: string, projectId: string, category: SavedCategory) => void;
  reorderCategories: (spaceId: string, projectId: string, oldIndex: number, newIndex: number) => void;

  addSavedGroup: (spaceId: string, projectId: string, categoryId: string, group: SavedGroup) => void;
  removeSavedGroup: (spaceId: string, projectId: string, categoryId: string, group: SavedGroup) => void;
  updateSavedGroup: (spaceId: string, projectId: string, categoryId: string, group: SavedGroup) => void;
  reorderGroups: (spaceId: string, projectId: string, categoryId: string, fromIndex: number, toIndex: number) => void;

  addSavedTab: (spaceId: string, projectId: string, categoryId: string, groupId: string, tab: SavedTab) => void;
  addSavedTabsBatch: (spaceId: string, projectId: string, categoryId: string, groupId: string, tabs: SavedTab[]) => void;
  removeSavedTab: (spaceId: string, projectId: string, categoryId: string, groupId: string, tab: SavedTab) => void;
  updateSavedTab: (spaceId: string, projectId: string, categoryId: string, groupId: string, tab: SavedTab) => void;
  reorderTabsInGroup: (spaceId: string, projectId: string, categoryId: string, groupId: string, fromIndex: number, toIndex: number) => void;
  moveTabBetweenGroups: (spaceId: string, projectId: string, categoryId: string, sourceGroupId: string, targetGroupId: string, tabId: string, insertIndex?: number) => void;

  // Cross-boundary moves
  moveGroupToCategory: (srcSpaceId: string, srcProjectId: string, srcCategoryId: string, groupId: string, tgtSpaceId: string, tgtProjectId: string, tgtCategoryId: string) => void;
  moveTabCrossBoundary: (srcSpaceId: string, srcProjectId: string, srcCategoryId: string, srcGroupId: string, tabId: string, tgtSpaceId: string, tgtProjectId: string, tgtCategoryId: string, tgtGroupId: string, insertIndex?: number) => void;
  moveCategoryToProject: (srcSpaceId: string, srcProjectId: string, categoryId: string, tgtSpaceId: string, tgtProjectId: string) => void;
  moveProjectToSpace: (srcSpaceId: string, projectId: string, tgtSpaceId: string) => void;
}

// --- Derived selectors ---

export const useActiveSpace = () => useSavedSpacesStore(s => s.savedSpaces.find(sp => sp.id === s.activeSpaceId));
export const useActiveProject = () => useSavedSpacesStore(s => {
  const space = s.savedSpaces.find(sp => sp.id === s.activeSpaceId);
  return space?.projects.find(p => p.id === s.activeProjectId);
});
export const useActiveCategory = () => useSavedSpacesStore(s => {
  const space = s.savedSpaces.find(sp => sp.id === s.activeSpaceId);
  const project = space?.projects.find(p => p.id === s.activeProjectId);
  return project?.categories.find(c => c.id === s.activeCategoryId);
});
const EMPTY_GROUPS: SavedGroup[] = [];
export const useActiveGroups = () => useSavedSpacesStore(s => {
  const space = s.savedSpaces.find(sp => sp.id === s.activeSpaceId);
  const project = space?.projects.find(p => p.id === s.activeProjectId);
  const category = project?.categories.find(c => c.id === s.activeCategoryId);
  return category?.groups ?? EMPTY_GROUPS;
});

// Pre-generate IDs for default data
const defaultSpaceId = uuidv7();
const defaultProjectId = uuidv7();
const defaultCategoryId = uuidv7();

// The seed uses the same names as the default path (TASK-20/TASK-24), so
// "General" only ever names a project, never a category in another place.
export function ensureDefaultData() {
  if (yjs.spacesArray.length === 0) {
    yjs.setSpaces([{
      id: defaultSpaceId, name: "Personal", order: 0,
      projects: [{
        id: defaultProjectId, name: DEFAULT_PROJECT_NAME, order: 0,
        categories: [{
          id: defaultCategoryId, name: DEFAULT_CATEGORY_NAME, order: 0,
          groups: [],
        }],
      }],
    }]);
  }
}

/**
 * Sync the Yjs spaces into the store and ensure a valid active space → project →
 * category selection (so the first group shows). With forceFirst=true the
 * current selection is ignored and the first available is selected (used right
 * after login); otherwise a still-valid selection is kept.
 */
export function syncActiveSelection(forceFirst = false): void {
  const spaces = yjs.getSpaces();
  const state = useSavedSpacesStore.getState();
  const keep = !forceFirst;

  const activeSpaceId = keep && state.activeSpaceId && spaces.some(s => s.id === state.activeSpaceId)
    ? state.activeSpaceId : spaces[0]?.id ?? null;
  const activeSpace = spaces.find(s => s.id === activeSpaceId);
  const activeProjectId = keep && state.activeProjectId && activeSpace?.projects.some(p => p.id === state.activeProjectId)
    ? state.activeProjectId : activeSpace?.projects[0]?.id ?? null;
  const activeProject = activeSpace?.projects.find(p => p.id === activeProjectId);
  const activeCategoryId = keep && state.activeCategoryId && activeProject?.categories.some(c => c.id === state.activeCategoryId)
    ? state.activeCategoryId : activeProject?.categories[0]?.id ?? null;

  useSavedSpacesStore.setState({ savedSpaces: spaces, activeSpaceId, activeProjectId, activeCategoryId });
}

/** Seed only an absent workspace; a successfully loaded empty tree is durable. */
export async function hydrateYjs(): Promise<void> {
  if (yjsHydrated) return;
  const loaded = await yjs.loadPersistedState();
  if (!loaded) {
    ensureDefaultData();
    // Mark initialization durably even in a popup without a persistence observer.
    await yjs.persistState();
  }
  yjsHydrated = true;
  syncActiveSelection(false);
}

export const useSavedSpacesStore = create<SavedSpacesState>()(
  persist(
    (set, get) => ({
      savedSpaces: [],
      activeSpaceId: null,
      activeProjectId: null,
      activeCategoryId: null,
      expandedProjectIds: [],
      lastModified: Date.now(),

      // --- Active selections (UI state, no Yjs) ---
      setActiveSpace: (id) => set(() => {
        const spaces = get().savedSpaces;
        const space = id ? spaces.find(s => s.id === id) : null;
        const firstProject = space?.projects[0];
        const firstCategory = firstProject?.categories[0];
        return {
          activeSpaceId: id,
          activeProjectId: firstProject?.id ?? null,
          activeCategoryId: firstCategory?.id ?? null,
        };
      }),
      setActiveProject: (id) => set(() => {
        const spaces = get().savedSpaces;
        const space = spaces.find(s => s.id === get().activeSpaceId);
        const project = id ? space?.projects.find(p => p.id === id) : null;
        return {
          activeProjectId: id,
          activeCategoryId: project?.categories[0]?.id ?? null,
        };
      }),
      setActiveCategory: (id) => set({ activeCategoryId: id }),
      toggleExpandedProject: (projectId) => set((state) => {
        const ids = state.expandedProjectIds;
        return {
          expandedProjectIds: ids.includes(projectId)
            ? ids.filter(id => id !== projectId)
            : [...ids, projectId],
        };
      }),

      // --- Space CRUD (Yjs mutations) ---
      addSavedSpace: (space) => {
        yjs.addSpace(space);
      },
      removeSavedSpace: (space) => {
        yjs.removeSpace(space.id);
        const state = get();
        if (state.activeSpaceId === space.id) {
          const spaces = yjs.getSpaces();
          set({
            activeSpaceId: spaces[0]?.id ?? null,
            activeProjectId: null,
            activeCategoryId: null,
          });
        }
      },
      updateSavedSpace: (space) => {
        yjs.updateSpace(space);
      },
      reorderSpaces: (oldIndex, newIndex) => {
        yjs.reorderInArray(yjs.spacesArray, oldIndex, newIndex);
      },

      // --- Project CRUD ---
      addSavedProject: (spaceId, project) => {
        yjs.addProject(spaceId, project);
      },
      removeSavedProject: (spaceId, project) => {
        yjs.removeProject(spaceId, project.id);
        if (get().activeProjectId === project.id) {
          const spaces = yjs.getSpaces();
          const space = spaces.find(s => s.id === spaceId);
          set({
            activeProjectId: space?.projects[0]?.id ?? null,
            activeCategoryId: null,
          });
        }
      },
      updateSavedProject: (spaceId, project) => {
        yjs.updateProject(spaceId, project);
      },
      reorderProjects: (spaceId, oldIndex, newIndex) => {
        const space = yjs.findSpace(spaceId);
        if (!space) return;
        const projects = space.map.get("projects") as YArray<YMap<unknown>>;
        yjs.reorderInArray(projects, oldIndex, newIndex);
      },

      // --- Category CRUD ---
      addSavedCategory: (spaceId, projectId, category) => {
        yjs.addCategory(spaceId, projectId, category);
      },
      removeSavedCategory: (spaceId, projectId, category) => {
        yjs.removeCategory(spaceId, projectId, category.id);
        if (get().activeCategoryId === category.id) {
          const spaces = yjs.getSpaces();
          const space = spaces.find(s => s.id === spaceId);
          const project = space?.projects.find(p => p.id === projectId);
          set({ activeCategoryId: project?.categories[0]?.id ?? null });
        }
      },
      updateSavedCategory: (spaceId, projectId, category) => {
        yjs.updateCategory(spaceId, projectId, category);
      },
      reorderCategories: (spaceId, projectId, oldIndex, newIndex) => {
        const project = yjs.findProject(spaceId, projectId);
        if (!project) return;
        const categories = project.map.get("categories") as YArray<YMap<unknown>>;
        yjs.reorderInArray(categories, oldIndex, newIndex);
      },

      // --- Group CRUD ---
      addSavedGroup: (spaceId, projectId, categoryId, group) => {
        yjs.addGroup(spaceId, projectId, categoryId, group);
      },
      removeSavedGroup: (spaceId, projectId, categoryId, group) => {
        yjs.removeGroup(spaceId, projectId, categoryId, group.id);
      },
      updateSavedGroup: (spaceId, projectId, categoryId, group) => {
        yjs.updateGroup(spaceId, projectId, categoryId, group);
      },
      reorderGroups: (spaceId, projectId, categoryId, fromIndex, toIndex) => {
        const category = yjs.findCategory(spaceId, projectId, categoryId);
        if (!category) return;
        const groups = category.map.get("groups") as YArray<YMap<unknown>>;
        yjs.reorderInArray(groups, fromIndex, toIndex);
      },

      // --- Tab CRUD ---
      addSavedTab: (spaceId, projectId, categoryId, groupId, tab) => {
        yjs.addTab(spaceId, projectId, categoryId, groupId, tab);
      },
      addSavedTabsBatch: (spaceId, projectId, categoryId, groupId, tabs) => {
        yjs.addTabsBatch(spaceId, projectId, categoryId, groupId, tabs);
      },
      removeSavedTab: (spaceId, projectId, categoryId, groupId, tab) => {
        yjs.removeTab(spaceId, projectId, categoryId, groupId, tab.id);
      },
      updateSavedTab: (spaceId, projectId, categoryId, groupId, tab) => {
        yjs.updateTab(spaceId, projectId, categoryId, groupId, tab);
      },
      reorderTabsInGroup: (spaceId, projectId, categoryId, groupId, fromIndex, toIndex) => {
        const group = yjs.findGroup(spaceId, projectId, categoryId, groupId);
        if (!group) return;
        const tabs = group.map.get("tabs") as YArray<YMap<unknown>>;
        yjs.reorderInArray(tabs, fromIndex, toIndex);
      },
      moveTabBetweenGroups: (spaceId, projectId, categoryId, sourceGroupId, targetGroupId, tabId, insertIndex) => {
        yjs.moveTabBetweenGroups(spaceId, projectId, categoryId, sourceGroupId, targetGroupId, tabId, insertIndex);
      },

      // Cross-boundary moves
      moveGroupToCategory: (srcSpaceId, srcProjectId, srcCategoryId, groupId, tgtSpaceId, tgtProjectId, tgtCategoryId) => {
        yjs.moveGroupToCategory(srcSpaceId, srcProjectId, srcCategoryId, groupId, tgtSpaceId, tgtProjectId, tgtCategoryId);
      },
      moveTabCrossBoundary: (srcSpaceId, srcProjectId, srcCategoryId, srcGroupId, tabId, tgtSpaceId, tgtProjectId, tgtCategoryId, tgtGroupId, insertIndex) => {
        yjs.moveTabCrossBoundary(srcSpaceId, srcProjectId, srcCategoryId, srcGroupId, tabId, tgtSpaceId, tgtProjectId, tgtCategoryId, tgtGroupId, insertIndex);
      },
      moveCategoryToProject: (srcSpaceId, srcProjectId, categoryId, tgtSpaceId, tgtProjectId) => {
        yjs.moveCategoryToProject(srcSpaceId, srcProjectId, categoryId, tgtSpaceId, tgtProjectId);
      },
      moveProjectToSpace: (srcSpaceId, projectId, tgtSpaceId) => {
        yjs.moveProjectToSpace(srcSpaceId, projectId, tgtSpaceId);
      },
    }),
    {
      name: 'spaces',
      version: STORE_VERSION,
      storage: createJSONStorage(() => storage),
      // UI selection only — never savedSpaces (Yjs is data authority; FE-C2)
      partialize: (state) => ({
        activeSpaceId: state.activeSpaceId,
        activeProjectId: state.activeProjectId,
        activeCategoryId: state.activeCategoryId,
        expandedProjectIds: state.expandedProjectIds,
        lastModified: state.lastModified,
      }),
      merge: (persisted, current) => {
        const data = persisted as Partial<SavedSpacesState> | null;
        return {
          ...current,
          activeSpaceId: data?.activeSpaceId ?? current.activeSpaceId,
          activeProjectId: data?.activeProjectId ?? current.activeProjectId,
          activeCategoryId: data?.activeCategoryId ?? current.activeCategoryId,
          expandedProjectIds: data?.expandedProjectIds ?? current.expandedProjectIds,
          lastModified: data?.lastModified ?? current.lastModified,
        };
      },
    }
  )
);

// --- Yjs observer: Zustand is a reactive VIEW of Yjs (FE-C2) ---
// Authority for spaces data is the Yjs doc (+ flextab_yjs_state). This mirror
// exists so React can subscribe cheaply; it must not drive data persistence.
// Do not bump lastModified here — that field is partialize'd UI metadata and
// would thrash chrome.storage on every tree edit without changing selection.
yjs.spacesArray.observeDeep(() => {
  useSavedSpacesStore.setState({
    savedSpaces: yjs.getSpaces(),
  });
});

// Hydration hook — waits for both Zustand persist AND Yjs state to load
export const useHydrated = () => {
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      // Wait for Zustand persist (UI state)
      if (!useSavedSpacesStore.persist.hasHydrated()) {
        await new Promise<void>(resolve => {
          const unsub = useSavedSpacesStore.persist.onFinishHydration(() => { unsub(); resolve(); });
        });
      }
      // Wait for Yjs (data)
      await hydrateYjs();
      if (!cancelled) setHydrated(true);
    }
    void hydrate().catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, []);
  return { hydrated, error };
};
