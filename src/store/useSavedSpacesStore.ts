import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { SavedSpace, SavedProject, SavedCategory, SavedGroup, SavedTab } from "../types";
import { v7 as uuidv7 } from "uuid";

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
    (set) => ({
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

      setSavedSpaces: (savedSpaces) => set({ savedSpaces }),
      setActiveSpace: (activeSpace) => set({ activeSpace }),
      setActiveProject: (activeProject) => set({ activeProject }),
      setActiveCategory: (activeCategory) => set({ activeCategory }),

      addSavedSpace: (space) => set((state) => ({ savedSpaces: [...state.savedSpaces, space] })),
      removeSavedSpace: (space) => set((state) => ({ savedSpaces: state.savedSpaces.filter((s) => s.id !== space.id) })),
      updateSavedSpace: (space) => set((state) => ({ savedSpaces: state.savedSpaces.map((s) => (s.id === space.id ? space : s)) })),

      addSavedProject: (spaceId, project) =>
        set((state) => ({
          savedSpaces: state.savedSpaces.map((s) =>
            s.id === spaceId ? { ...s, projects: [...s.projects, project] } : s
          ),
        })),

      removeSavedProject: (spaceId, project) =>
        set((state) => ({
          savedSpaces: state.savedSpaces.map((s) =>
            s.id === spaceId ? { ...s, projects: s.projects.filter((p) => p.id !== project.id) } : s
          ),
        })),

      updateSavedProject: (spaceId, project) =>
        set((state) => ({
          savedSpaces: state.savedSpaces.map((s) =>
            s.id === spaceId
              ? { ...s, projects: s.projects.map((p) => (p.id === project.id ? project : p)) }
              : s
          ),
        })),

      addSavedCategory: (spaceId, projectId, category) =>
        set((state) => ({
          savedSpaces: state.savedSpaces.map((s) =>
            s.id === spaceId
              ? {
                  ...s,
                  projects: s.projects.map((p) =>
                    p.id === projectId ? { ...p, categories: [...p.categories, category] } : p
                  ),
                }
              : s
          ),
        })),

      removeSavedCategory: (spaceId, projectId, category) =>
        set((state) => ({
          savedSpaces: state.savedSpaces.map((s) =>
            s.id === spaceId
              ? {
                  ...s,
                  projects: s.projects.map((p) =>
                    p.id === projectId
                      ? { ...p, categories: p.categories.filter((c) => c.id !== category.id) }
                      : p
                  ),
                }
              : s
          ),
        })),

      updateSavedCategory: (spaceId, projectId, category) =>
        set((state) => ({
          savedSpaces: state.savedSpaces.map((s) =>
            s.id === spaceId
              ? {
                  ...s,
                  projects: s.projects.map((p) =>
                    p.id === projectId
                      ? {
                          ...p,
                          categories: p.categories.map((c) =>
                            c.id === category.id ? category : c
                          ),
                        }
                      : p
                  ),
                }
              : s
          ),
        })),

      addSavedGroup: (spaceId, projectId, categoryId, group) =>
        set((state) => ({
          savedSpaces: state.savedSpaces.map((s) =>
            s.id === spaceId
              ? {
                  ...s,
                  projects: s.projects.map((p) =>
                    p.id === projectId
                      ? {
                          ...p,
                          categories: p.categories.map((c) =>
                            c.id === categoryId ? { ...c, groups: [...c.groups, group] } : c
                          ),
                        }
                      : p
                  ),
                }
              : s
          ),
        })),

      removeSavedGroup: (spaceId, projectId, categoryId, group) =>
        set((state) => ({
          savedSpaces: state.savedSpaces.map((s) =>
            s.id === spaceId
              ? {
                  ...s,
                  projects: s.projects.map((p) =>
                    p.id === projectId
                      ? {
                          ...p,
                          categories: p.categories.map((c) =>
                            c.id === categoryId
                              ? { ...c, groups: c.groups.filter((g) => g.id !== group.id) }
                              : c
                          ),
                        }
                      : p
                  ),
                }
              : s
          ),
        })),

      updateSavedGroup: (spaceId, projectId, categoryId, group) =>
        set((state) => ({
          savedSpaces: state.savedSpaces.map((s) =>
            s.id === spaceId
              ? {
                  ...s,
                  projects: s.projects.map((p) =>
                    p.id === projectId
                      ? {
                          ...p,
                          categories: p.categories.map((c) =>
                            c.id === categoryId
                              ? {
                                  ...c,
                                  groups: c.groups.map((g) => (g.id === group.id ? group : g)),
                                }
                              : c
                          ),
                        }
                      : p
                  ),
                }
              : s
          ),
        })),

      addSavedTab: (spaceId, projectId, categoryId, groupId, tab) =>
        set((state) => ({
          savedSpaces: state.savedSpaces.map((s) =>
            s.id === spaceId
              ? {
                  ...s,
                  projects: s.projects.map((p) =>
                    p.id === projectId
                      ? {
                          ...p,
                          categories: p.categories.map((c) =>
                            c.id === categoryId
                              ? {
                                  ...c,
                                  groups: c.groups.map((g) =>
                                    g.id === groupId
                                      ? {
                                          ...g,
                                          tabs: [
                                            ...g.tabs.map((existingTab, index) => ({
                                              ...existingTab,
                                              order: existingTab.order ?? index,
                                            })),
                                            {
                                              ...tab,
                                              order: tab.order ?? g.tabs.length,
                                            },
                                          ],
                                        }
                                      : g
                                  ),
                                }
                              : c
                          ),
                        }
                      : p
                  ),
                }
              : s
          ),
        })),

      removeSavedTab: (spaceId, projectId, categoryId, groupId, tab) =>
        set((state) => ({
          savedSpaces: state.savedSpaces.map((s) =>
            s.id === spaceId
              ? {
                  ...s,
                  projects: s.projects.map((p) =>
                    p.id === projectId
                      ? {
                          ...p,
                          categories: p.categories.map((c) =>
                            c.id === categoryId
                              ? {
                                  ...c,
                                  groups: c.groups.map((g) =>
                                    g.id === groupId
                                      ? { ...g, tabs: g.tabs.filter((t) => t.id !== tab.id) }
                                      : g
                                  ),
                                }
                              : c
                          ),
                        }
                      : p
                  ),
                }
              : s
          ),
        })),

      updateSavedTab: (spaceId, projectId, categoryId, groupId, tab) =>
        set((state) => ({
          savedSpaces: state.savedSpaces.map((s) =>
            s.id === spaceId
              ? {
                  ...s,
                  projects: s.projects.map((p) =>
                    p.id === projectId
                      ? {
                          ...p,
                          categories: p.categories.map((c) =>
                            c.id === categoryId
                              ? {
                                  ...c,
                                  groups: c.groups.map((g) =>
                                    g.id === groupId
                                      ? {
                                          ...g,
                                          tabs: g.tabs.map((t) => (t.id === tab.id ? tab : t)),
                                        }
                                      : g
                                  ),
                                }
                              : c
                          ),
                        }
                      : p
                  ),
                }
              : s
          ),
        })),
    }),
    {
      name: 'spaces', // unique name for localStorage
      storage: createJSONStorage(() => localStorage),
    }
  )
);
