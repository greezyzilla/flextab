import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { storage } from './syncStorage';

export type GroupLayout = 'list' | 'grid';
export type Density = 'compact' | 'comfortable';
export type AccentColor = 'blue' | 'purple' | 'green' | 'orange' | 'pink' | 'cyan';

export const ACCENT_COLORS: Record<AccentColor, { label: string; value: string; hover: string; subtle: string }> = {
  blue:   { label: 'Blue',   value: '#3b82f6', hover: '#2563eb', subtle: '#3b82f620' },
  purple: { label: 'Purple', value: '#8b5cf6', hover: '#7c3aed', subtle: '#8b5cf620' },
  green:  { label: 'Green',  value: '#22c55e', hover: '#16a34a', subtle: '#22c55e20' },
  orange: { label: 'Orange', value: '#f97316', hover: '#ea580c', subtle: '#f9731620' },
  pink:   { label: 'Pink',   value: '#ec4899', hover: '#db2777', subtle: '#ec489920' },
  cyan:   { label: 'Cyan',   value: '#06b6d4', hover: '#0891b2', subtle: '#06b6d420' },
};

interface SettingsState {
  groupLayout: GroupLayout;
  gridColumns: number;
  density: Density;
  accentColor: AccentColor;
  customAccent: string | null; // hex, overrides accentColor preset if set
  bgTint: number; // 0-15, background tint intensity (hue derived from accent)
  autoSync: boolean; // when signed in, keep the realtime sync engine connected

  setGroupLayout: (layout: GroupLayout) => void;
  setGridColumns: (columns: number) => void;
  setDensity: (density: Density) => void;
  setAccentColor: (color: AccentColor) => void;
  setCustomAccent: (color: string | null) => void;
  setBgTint: (tint: number) => void;
  setAutoSync: (autoSync: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      groupLayout: 'list',
      gridColumns: 2,
      density: 'comfortable',
      accentColor: 'blue',
      customAccent: null,
      bgTint: 0,
      autoSync: true,

      setGroupLayout: (groupLayout) => set({ groupLayout }),
      setGridColumns: (gridColumns) => set({ gridColumns }),
      setDensity: (density) => set({ density }),
      setAccentColor: (accentColor) => set({ accentColor, customAccent: null }),
      setCustomAccent: (customAccent) => set({ customAccent }),
      setBgTint: (bgTint) => set({ bgTint }),
      setAutoSync: (autoSync) => set({ autoSync }),
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
