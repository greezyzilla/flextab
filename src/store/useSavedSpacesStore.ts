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

interface SavedSpacesState {
  savedSpaces: SavedSpace[];
  activeSpace: number;
  activeProject: number;
  activeCategory: number;

  setSavedSpaces: (savedSpaces: SavedSpace[]) => void;
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

  addSavedCategory: (spaceId: string, projectId: string, category: SavedCategory) => void;
  removeSavedCategory: (spaceId: string, projectId: string, category: SavedCategory) => void;
  updateSavedCategory: (spaceId: string, projectId: string, category: SavedCategory) => void;

  addSavedGroup: (spaceId: string, projectId: string, categoryId: string, group: SavedGroup) => void;
  removeSavedGroup: (spaceId: string, projectId: string, categoryId: string, group: SavedGroup) => void;
  updateSavedGroup: (spaceId: string, projectId: string, categoryId: string, group: SavedGroup) => void;

  addSavedTab: (spaceId: string, projectId: string, categoryId: string, groupId: string, tab: SavedTab) => void;
  removeSavedTab: (spaceId: string, projectId: string, categoryId: string, groupId: string, tab: SavedTab) => void;
  updateSavedTab: (spaceId: string, projectId: string, categoryId: string, groupId: string, tab: SavedTab) => void;
}

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

      setSavedSpaces: (savedSpaces) => set((state) => { state.savedSpaces = savedSpaces }),
      setActiveSpace: (activeSpace) => set((state) => { state.activeSpace = activeSpace }),
      setActiveProject: (activeProject) => set((state) => { state.activeProject = activeProject }),
      setActiveCategory: (activeCategory) => set((state) => { state.activeCategory = activeCategory }),

      addSavedSpace: (space) => set((state) => {
        state.savedSpaces.push(space);
      }),
      removeSavedSpace: (space) => set((state) => {
        state.savedSpaces = state.savedSpaces.filter((s) => s.id !== space.id);
      }),
      updateSavedSpace: (space) => set((state) => {
        const index = state.savedSpaces.findIndex((s) => s.id === space.id);
        if (index !== -1) state.savedSpaces[index] = space;
      }),

      reorderSpaces: (oldIndex, newIndex) => set((state) => {
        const [removed] = state.savedSpaces.splice(oldIndex, 1);
        state.savedSpaces.splice(newIndex, 0, removed);
      }),

      addSavedProject: (spaceId, project) => set((state) => {
        const space = state.savedSpaces.find((s) => s.id === spaceId);
        if (space) space.projects.push(project);
      }),

      removeSavedProject: (spaceId, project) => set((state) => {
        const space = state.savedSpaces.find((s) => s.id === spaceId);
        if (space) {
          space.projects = space.projects.filter((p) => p.id !== project.id);
        }
      }),

      updateSavedProject: (spaceId, project) => set((state) => {
        const space = state.savedSpaces.find((s) => s.id === spaceId);
        const pIndex = space?.projects.findIndex((p) => p.id === project.id);
        if (space && pIndex !== undefined && pIndex !== -1) {
          space.projects[pIndex] = project;
        }
      }),

      addSavedCategory: (spaceId, projectId, category) => set((state) => {
        const space = state.savedSpaces.find((s) => s.id === spaceId);
        const project = space?.projects.find((p) => p.id === projectId);
        if (project) project.categories.push(category);
      }),

      removeSavedCategory: (spaceId, projectId, category) => set((state) => {
        const space = state.savedSpaces.find((s) => s.id === spaceId);
        const project = space?.projects.find((p) => p.id === projectId);
        if (project) {
          project.categories = project.categories.filter((c) => c.id !== category.id);
        }
      }),

      updateSavedCategory: (spaceId, projectId, category) => set((state) => {
        const space = state.savedSpaces.find((s) => s.id === spaceId);
        const project = space?.projects.find((p) => p.id === projectId);
        const cIndex = project?.categories.findIndex((c) => c.id === category.id);
        if (project && cIndex !== undefined && cIndex !== -1) {
          project.categories[cIndex] = category;
        }
      }),

      addSavedGroup: (spaceId, projectId, categoryId, group) => set((state) => {
        const space = state.savedSpaces.find((s) => s.id === spaceId);
        const project = space?.projects.find((p) => p.id === projectId);
        const category = project?.categories.find((c) => c.id === categoryId);
        if (category) category.groups.push(group);
      }),

      removeSavedGroup: (spaceId, projectId, categoryId, group) => set((state) => {
        const space = state.savedSpaces.find((s) => s.id === spaceId);
        const project = space?.projects.find((p) => p.id === projectId);
        const category = project?.categories.find((c) => c.id === categoryId);
        if (category) {
          category.groups = category.groups.filter((g) => g.id !== group.id);
        }
      }),

      updateSavedGroup: (spaceId, projectId, categoryId, group) => set((state) => {
        const space = state.savedSpaces.find((s) => s.id === spaceId);
        const project = space?.projects.find((p) => p.id === projectId);
        const category = project?.categories.find((c) => c.id === categoryId);
        const gIndex = category?.groups.findIndex((g) => g.id === group.id);
        if (category && gIndex !== undefined && gIndex !== -1) {
          category.groups[gIndex] = group;
        }
      }),

      addSavedTab: (spaceId, projectId, categoryId, groupId, tab) => set((state) => {
        const space = state.savedSpaces.find((s) => s.id === spaceId);
        const project = space?.projects.find((p) => p.id === projectId);
        const category = project?.categories.find((c) => c.id === categoryId);
        const group = category?.groups.find((g) => g.id === groupId);

        if (group) {
          // Re-indexing existing tabs
          group.tabs.forEach((t, i) => { t.order = t.order ?? i; });
          
          const newTab = { ...tab, order: tab.order ?? group.tabs.length };
          group.tabs.push(newTab);
        }
      }),

      removeSavedTab: (spaceId, projectId, categoryId, groupId, tab) => set((state) => {
        const space = state.savedSpaces.find((s) => s.id === spaceId);
        const project = space?.projects.find((p) => p.id === projectId);
        const category = project?.categories.find((c) => c.id === categoryId);
        const group = category?.groups.find((g) => g.id === groupId);

        if (group) {
          group.tabs = group.tabs.filter((t) => t.id !== tab.id);
        }
      }),

      updateSavedTab: (spaceId, projectId, categoryId, groupId, tab) => set((state) => {
        const space = state.savedSpaces.find((s) => s.id === spaceId);
        const project = space?.projects.find((p) => p.id === projectId);
        const category = project?.categories.find((c) => c.id === categoryId);
        const group = category?.groups.find((g) => g.id === groupId);
        const tIndex = group?.tabs.findIndex((t) => t.id === tab.id);

        if (group && tIndex !== undefined && tIndex !== -1) {
          group.tabs[tIndex] = tab;
        }
      }),
    })),
    {
      name: 'spaces',
      storage: createJSONStorage(() => storage),
    }
  )
);
