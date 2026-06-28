import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { storage } from './syncStorage';

export type GroupLayout = 'list' | 'grid';
export type Density = 'compact' | 'comfortable';

/** Quick-pick hues (0–360) for the accent slider. */
export const HUE_PRESETS: { label: string; hue: number }[] = [
  { label: 'Blue', hue: 214 },
  { label: 'Purple', hue: 262 },
  { label: 'Pink', hue: 330 },
  { label: 'Orange', hue: 28 },
  { label: 'Green', hue: 145 },
  { label: 'Cyan', hue: 190 },
];

// hex -> hue (0-360), for migrating old custom accents
function hexToHue(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 214;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return 214;
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return Math.round(h * 360);
}

interface SettingsState {
  groupLayout: GroupLayout;
  gridColumns: number;
  density: Density;
  hue: number;       // 0-360, accent hue
  intensity: number; // 0-100, overall colour strength (0 = grayscale)
  autoSync: boolean;

  setGroupLayout: (layout: GroupLayout) => void;
  setGridColumns: (columns: number) => void;
  setDensity: (density: Density) => void;
  setHue: (hue: number) => void;
  setIntensity: (intensity: number) => void;
  setAutoSync: (autoSync: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      groupLayout: 'list',
      gridColumns: 2,
      density: 'comfortable',
      hue: 214,
      intensity: 100,
      autoSync: true,

      setGroupLayout: (groupLayout) => set({ groupLayout }),
      setGridColumns: (gridColumns) => set({ gridColumns }),
      setDensity: (density) => set({ density }),
      setHue: (hue) => set({ hue }),
      setIntensity: (intensity) => set({ intensity }),
      setAutoSync: (autoSync) => set({ autoSync }),
    }),
    {
      name: 'flextab-settings',
      version: 2,
      migrate: (persisted: unknown, version) => {
        const s = persisted as Record<string, unknown> | null;
        if (s && version < 1) {
          // old shape: accentColor preset / customAccent hex -> hue
          const presetHue: Record<string, number> = { blue: 214, purple: 262, green: 145, orange: 28, pink: 330, cyan: 190 };
          if (typeof s.customAccent === 'string') s.hue = hexToHue(s.customAccent);
          else if (typeof s.accentColor === 'string') s.hue = presetHue[s.accentColor] ?? 214;
          delete s.accentColor;
          delete s.customAccent;
        }
        if (s && version < 2) {
          // bgTint (0-15 surface tint) -> intensity (0-100 overall colour); default vivid
          delete s.bgTint;
          if (typeof s.intensity !== 'number') s.intensity = 100;
        }
        return s as SettingsState;
      },
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
