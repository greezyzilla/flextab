import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { storage } from './syncStorage';

export type GroupLayout = 'list' | 'grid';
export type Density = 'compact' | 'comfortable';

interface SettingsState {
  groupLayout: GroupLayout;
  gridColumns: number;
  density: Density;

  setGroupLayout: (layout: GroupLayout) => void;
  setGridColumns: (columns: number) => void;
  setDensity: (density: Density) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      groupLayout: 'list',
      gridColumns: 2,
      density: 'comfortable',

      setGroupLayout: (groupLayout) => set({ groupLayout }),
      setGridColumns: (gridColumns) => set({ gridColumns }),
      setDensity: (density) => set({ density }),
    }),
    {
      name: 'flextab-settings',
      storage: {
        getItem: async (name) => {
          const value = await storage.getItem(name);
          return value ? JSON.parse(value) : null;
        },
        setItem: async (name, value) => {
          await storage.setItem(name, JSON.stringify(value));
        },
        removeItem: async (name) => {
          await storage.removeItem(name);
        },
      },
    },
  ),
);
