import { useState, useEffect } from 'react';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { SavedSpace, SavedProject, SavedCategory, SavedGroup, SavedTab } from "../types";
import { v7 as uuidv7 } from "uuid";
import { storage, setupStorageSync } from './syncStorage';

const STORE_VERSION = 1;

// --- Helpers for nested traversal (work on Immer drafts) ---

function findSpace(state: SavedSpacesState, spaceId: string) {
  return state.savedSpaces.find(s => s.id === spaceId);
}

function findProject(state: SavedSpacesState, spaceId: string, projectId: string) {
  return findSpace(state, spaceId)?.projects.find(p => p.id === projectId);
}

function findCategory(state: SavedSpacesState, spaceId: string, projectId: string, categoryId: string) {
  return findProject(state, spaceId, projectId)?.categories.find(c => c.id === categoryId);
}

function findGroup(state: SavedSpacesState, spaceId: string, projectId: string, categoryId: string, groupId: string) {
  return findCategory(state, spaceId, projectId, categoryId)?.groups.find(g => g.id === groupId);
}

interface SavedSpacesState {
  savedSpaces: SavedSpace[];
  activeSpaceId: string | null;
  activeProjectId: string | null;
  activeCategoryId: string | null;
  lastModified: number;

  setActiveSpace: (id: string | null) => void;
  setActiveProject: (id: string | null) => void;
  setActiveCategory: (id: string | null) => void;

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
  removeSavedTab: (spaceId: string, projectId: string, categoryId: string, groupId: string, tab: SavedTab) => void;
  updateSavedTab: (spaceId: string, projectId: string, categoryId: string, groupId: string, tab: SavedTab) => void;
  reorderTabsInGroup: (spaceId: string, projectId: string, categoryId: string, groupId: string, fromIndex: number, toIndex: number) => void;
  moveTabBetweenGroups: (spaceId: string, projectId: string, categoryId: string, sourceGroupId: string, targetGroupId: string, tabId: string, insertIndex?: number) => void;
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
export const useActiveGroups = () => useSavedSpacesStore(s => {
  const space = s.savedSpaces.find(sp => sp.id === s.activeSpaceId);
  const project = space?.projects.find(p => p.id === s.activeProjectId);
  const category = project?.categories.find(c => c.id === s.activeCategoryId);
  return category?.groups ?? [];
});

// Pre-generate IDs so initial active selections can reference them
const defaultSpaceId = uuidv7();
const defaultProjectId = uuidv7();
const defaultCategoryId = uuidv7();

export const useSavedSpacesStore = create<SavedSpacesState>()(
  persist(
    immer((set) => ({
      savedSpaces: [
        {
          id: defaultSpaceId,
          name: "Personal",
          projects: [
            {
              id: defaultProjectId,
              name: "Default Project",
              categories: [
                {
                  id: defaultCategoryId,
                  name: "Default Category",
                  groups: [
                    {
                      id: uuidv7(),
                      name: "Default Group",
                      tabs: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
      activeSpaceId: defaultSpaceId,
      activeProjectId: defaultProjectId,
      activeCategoryId: defaultCategoryId,
      lastModified: Date.now(),

      setActiveSpace: (id) => set((state) => {
        state.activeSpaceId = id;
        const space = id ? state.savedSpaces.find(s => s.id === id) : null;
        const firstProject = space?.projects[0];
        const firstCategory = firstProject?.categories[0];
        state.activeProjectId = firstProject?.id ?? null;
        state.activeCategoryId = firstCategory?.id ?? null;
      }),
      setActiveProject: (id) => set((state) => {
        state.activeProjectId = id;
        const space = state.savedSpaces.find(s => s.id === state.activeSpaceId);
        const project = id ? space?.projects.find(p => p.id === id) : null;
        state.activeCategoryId = project?.categories[0]?.id ?? null;
      }),
      setActiveCategory: (id) => set((state) => { state.activeCategoryId = id }),

      // --- Space CRUD ---
      addSavedSpace: (space) => set((state) => {
        state.savedSpaces.push(space);
      }),
      removeSavedSpace: (space) => set((state) => {
        state.savedSpaces = state.savedSpaces.filter(s => s.id !== space.id);
        if (state.activeSpaceId === space.id) {
          state.activeSpaceId = state.savedSpaces[0]?.id ?? null;
          state.activeProjectId = null;
          state.activeCategoryId = null;
        }
      }),
      updateSavedSpace: (space) => set((state) => {
        const index = state.savedSpaces.findIndex(s => s.id === space.id);
        if (index !== -1) state.savedSpaces[index] = space;
      }),
      reorderSpaces: (oldIndex, newIndex) => set((state) => {
        const [removed] = state.savedSpaces.splice(oldIndex, 1);
        state.savedSpaces.splice(newIndex, 0, removed);
      }),

      // --- Project CRUD ---
      addSavedProject: (spaceId, project) => set((state) => {
        findSpace(state, spaceId)?.projects.push(project);
      }),
      removeSavedProject: (spaceId, project) => set((state) => {
        const space = findSpace(state, spaceId);
        if (space) {
          space.projects = space.projects.filter(p => p.id !== project.id);
          if (state.activeProjectId === project.id) {
            state.activeProjectId = space.projects[0]?.id ?? null;
            state.activeCategoryId = null;
          }
        }
      }),
      updateSavedProject: (spaceId, project) => set((state) => {
        const space = findSpace(state, spaceId);
        const idx = space?.projects.findIndex(p => p.id === project.id) ?? -1;
        if (space && idx !== -1) space.projects[idx] = project;
      }),
      reorderProjects: (spaceId, oldIndex, newIndex) => set((state) => {
        const space = findSpace(state, spaceId);
        if (space) {
          const [removed] = space.projects.splice(oldIndex, 1);
          space.projects.splice(newIndex, 0, removed);
        }
      }),

      // --- Category CRUD ---
      addSavedCategory: (spaceId, projectId, category) => set((state) => {
        findProject(state, spaceId, projectId)?.categories.push(category);
      }),
      removeSavedCategory: (spaceId, projectId, category) => set((state) => {
        const project = findProject(state, spaceId, projectId);
        if (project) {
          project.categories = project.categories.filter(c => c.id !== category.id);
          if (state.activeCategoryId === category.id) {
            state.activeCategoryId = project.categories[0]?.id ?? null;
          }
        }
      }),
      updateSavedCategory: (spaceId, projectId, category) => set((state) => {
        const project = findProject(state, spaceId, projectId);
        const idx = project?.categories.findIndex(c => c.id === category.id) ?? -1;
        if (project && idx !== -1) project.categories[idx] = category;
      }),
      reorderCategories: (spaceId, projectId, oldIndex, newIndex) => set((state) => {
        const project = findProject(state, spaceId, projectId);
        if (project) {
          const [removed] = project.categories.splice(oldIndex, 1);
          project.categories.splice(newIndex, 0, removed);
        }
      }),

      // --- Group CRUD ---
      addSavedGroup: (spaceId, projectId, categoryId, group) => set((state) => {
        findCategory(state, spaceId, projectId, categoryId)?.groups.push(group);
      }),
      removeSavedGroup: (spaceId, projectId, categoryId, group) => set((state) => {
        const category = findCategory(state, spaceId, projectId, categoryId);
        if (category) category.groups = category.groups.filter(g => g.id !== group.id);
      }),
      updateSavedGroup: (spaceId, projectId, categoryId, group) => set((state) => {
        const category = findCategory(state, spaceId, projectId, categoryId);
        const idx = category?.groups.findIndex(g => g.id === group.id) ?? -1;
        if (category && idx !== -1) category.groups[idx] = group;
      }),
      reorderGroups: (spaceId, projectId, categoryId, fromIndex, toIndex) => set((state) => {
        const category = findCategory(state, spaceId, projectId, categoryId);
        if (!category) return;
        const sorted = [...category.groups].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        const [removed] = sorted.splice(fromIndex, 1);
        sorted.splice(toIndex, 0, removed);
        category.groups = sorted.map((g, i) => ({ ...g, order: i }));
      }),

      // --- Tab CRUD ---
      addSavedTab: (spaceId, projectId, categoryId, groupId, tab) => set((state) => {
        const group = findGroup(state, spaceId, projectId, categoryId, groupId);
        if (group) {
          group.tabs.forEach((t, i) => { t.order = t.order ?? i; });
          group.tabs.push({ ...tab, order: tab.order ?? group.tabs.length });
        }
      }),
      removeSavedTab: (spaceId, projectId, categoryId, groupId, tab) => set((state) => {
        const group = findGroup(state, spaceId, projectId, categoryId, groupId);
        if (group) group.tabs = group.tabs.filter(t => t.id !== tab.id);
      }),
      updateSavedTab: (spaceId, projectId, categoryId, groupId, tab) => set((state) => {
        const group = findGroup(state, spaceId, projectId, categoryId, groupId);
        const idx = group?.tabs.findIndex(t => t.id === tab.id) ?? -1;
        if (group && idx !== -1) group.tabs[idx] = tab;
      }),
      reorderTabsInGroup: (spaceId, projectId, categoryId, groupId, fromIndex, toIndex) => set((state) => {
        const group = findGroup(state, spaceId, projectId, categoryId, groupId);
        if (!group) return;
        const sorted = [...group.tabs].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        const [removed] = sorted.splice(fromIndex, 1);
        sorted.splice(toIndex, 0, removed);
        group.tabs = sorted.map((t, i) => ({ ...t, order: i }));
      }),
      moveTabBetweenGroups: (spaceId, projectId, categoryId, sourceGroupId, targetGroupId, tabId, insertIndex) => set((state) => {
        const category = findCategory(state, spaceId, projectId, categoryId);
        if (!category) return;
        const sourceGroup = category.groups.find(g => g.id === sourceGroupId);
        const targetGroup = category.groups.find(g => g.id === targetGroupId);
        if (!sourceGroup || !targetGroup) return;

        const tabIndex = sourceGroup.tabs.findIndex(t => t.id === tabId);
        if (tabIndex === -1) return;

        const [tab] = sourceGroup.tabs.splice(tabIndex, 1);
        sourceGroup.tabs.forEach((t, i) => { t.order = i; });

        const targetTabs = [...targetGroup.tabs].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        const idx = insertIndex ?? targetTabs.length;
        targetTabs.splice(idx, 0, tab);
        targetGroup.tabs = targetTabs.map((t, i) => ({ ...t, order: i }));
      }),
    })),
    {
      name: 'spaces',
      version: STORE_VERSION,
      storage: createJSONStorage(() => storage),
      merge: (persisted, current) => {
        const data = persisted as Partial<SavedSpacesState> | null;
        if (!data || !Array.isArray(data.savedSpaces)) {
          return current;
        }
        // Validate each space has required fields
        const validSpaces = data.savedSpaces.filter(
          (s): s is SavedSpace =>
            !!s && typeof s.id === 'string' && typeof s.name === 'string' && Array.isArray(s.projects),
        );
        return {
          ...current,
          ...data,
          savedSpaces: validSpaces,
          activeSpaceId: data.activeSpaceId ?? current.activeSpaceId,
          activeProjectId: data.activeProjectId ?? current.activeProjectId,
          activeCategoryId: data.activeCategoryId ?? current.activeCategoryId,
          lastModified: data.lastModified ?? current.lastModified,
        };
      },
      migrate: (persisted: unknown, version: number) => {
        const state = persisted as Record<string, unknown>;
        if (version === 0) {
          // v0 → v1: index-based → ID-based selection + add lastModified
          const spaces = state.savedSpaces as SavedSpace[] | undefined;
          const oldSpaceIdx = (state.activeSpace as number) ?? 0;
          const oldProjectIdx = (state.activeProject as number) ?? 0;
          const oldCategoryIdx = (state.activeCategory as number) ?? 0;

          const space = spaces?.[oldSpaceIdx];
          const project = space?.projects[oldProjectIdx];
          const category = project?.categories[oldCategoryIdx];

          state.activeSpaceId = space?.id ?? spaces?.[0]?.id ?? null;
          state.activeProjectId = project?.id ?? space?.projects[0]?.id ?? null;
          state.activeCategoryId = category?.id ?? project?.categories[0]?.id ?? null;
          state.lastModified = (state.lastModified as number) ?? Date.now();

          // Clean up old index fields
          delete state.activeSpace;
          delete state.activeProject;
          delete state.activeCategory;
        }
        return state as SavedSpacesState;
      },
    }
  )
);

// Hydration hook — prevents flash of default state before persisted data loads
export const useHydrated = () => {
  const [hydrated, setHydrated] = useState(useSavedSpacesStore.persist.hasHydrated());
  useEffect(() => {
    const unsubscribe = useSavedSpacesStore.persist.onFinishHydration(() => setHydrated(true));
    return unsubscribe;
  }, []);
  return hydrated;
};

// Enable cross-tab and cross-device sync
setupStorageSync('spaces', () => useSavedSpacesStore.persist.rehydrate());
