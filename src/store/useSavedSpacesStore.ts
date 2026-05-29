import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { SavedSpace, SavedProject, SavedCategory, SavedGroup, SavedTab } from "../types";
import { v7 as uuidv7 } from "uuid";

const storage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    const result = await chrome.storage.local.get(name);
    return result[name] || null;
  },
  setItem: async (name: string, value: string): Promise<void> => {
    await chrome.storage.local.set({ [name]: value });
  },
  removeItem: async (name: string): Promise<void> => {
    await chrome.storage.local.remove(name);
  },
};

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
  activeSpace: number;
  activeProject: number;
  activeCategory: number;

  setActiveSpace: (index: number) => void;
  setActiveProject: (index: number) => void;
  setActiveCategory: (index: number) => void;

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

export const useActiveSpace = () => useSavedSpacesStore(s => s.savedSpaces[s.activeSpace]);
export const useActiveProject = () => useSavedSpacesStore(s => s.savedSpaces[s.activeSpace]?.projects[s.activeProject]);
export const useActiveCategory = () => useSavedSpacesStore(s => s.savedSpaces[s.activeSpace]?.projects[s.activeProject]?.categories[s.activeCategory]);
export const useActiveGroups = () => useSavedSpacesStore(s => s.savedSpaces[s.activeSpace]?.projects[s.activeProject]?.categories[s.activeCategory]?.groups ?? []);

export const useSavedSpacesStore = create<SavedSpacesState>()(
  persist(
    immer((set) => ({
      savedSpaces: [
        {
          id: uuidv7(),
          name: "Personal",
          projects: [
            {
              id: uuidv7(),
              name: "Default Project",
              categories: [
                {
                  id: uuidv7(),
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
      activeSpace: 0,
      activeProject: 0,
      activeCategory: 0,

      setActiveSpace: (activeSpace) => set((state) => { state.activeSpace = activeSpace }),
      setActiveProject: (activeProject) => set((state) => { state.activeProject = activeProject }),
      setActiveCategory: (activeCategory) => set((state) => { state.activeCategory = activeCategory }),

      // --- Space CRUD ---
      addSavedSpace: (space) => set((state) => {
        state.savedSpaces.push(space);
      }),
      removeSavedSpace: (space) => set((state) => {
        state.savedSpaces = state.savedSpaces.filter(s => s.id !== space.id);
        if (state.activeSpace >= state.savedSpaces.length) {
          state.activeSpace = Math.max(0, state.savedSpaces.length - 1);
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
          if (state.activeProject >= space.projects.length) {
            state.activeProject = Math.max(0, space.projects.length - 1);
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
          if (state.activeCategory >= project.categories.length) {
            state.activeCategory = Math.max(0, project.categories.length - 1);
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
        const [removed] = group.tabs.splice(fromIndex, 1);
        group.tabs.splice(toIndex, 0, removed);
        group.tabs.forEach((t, i) => { t.order = i; });
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
      storage: createJSONStorage(() => storage),
    }
  )
);
