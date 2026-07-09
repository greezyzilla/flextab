import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { storage } from './syncStorage';

export type GroupLayout = 'list' | 'grid';
export type Density = 'compact' | 'cozy' | 'comfortable';
export type FontKey = 'inter' | 'system' | 'rounded' | 'serif' | 'mono';

/** UI font options (system stacks — nothing bundled). Maps to --font-sans in useTheme. */
export const FONT_OPTIONS: { key: FontKey; label: string }[] = [
  { key: 'inter', label: 'Inter' },
  { key: 'system', label: 'System' },
  { key: 'rounded', label: 'Rounded' },
  { key: 'serif', label: 'Serif' },
  { key: 'mono', label: 'Mono' },
];

/** Quick-pick hues (0–360) for the accent slider. */
export const HUE_PRESETS: { label: string; hue: number }[] = [
  { label: 'Red', hue: 2 },
  { label: 'Orange', hue: 28 },
  { label: 'Amber', hue: 45 },
  { label: 'Lime', hue: 100 },
  { label: 'Green', hue: 145 },
  { label: 'Teal', hue: 168 },
  { label: 'Cyan', hue: 190 },
  { label: 'Blue', hue: 214 },
  { label: 'Indigo', hue: 240 },
  { label: 'Purple', hue: 262 },
  { label: 'Pink', hue: 330 },
  { label: 'Rose', hue: 348 },
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

/** Default appearance/layout preferences — the reset target (autoSync excluded;
 *  it's a sync concern, not a look-and-feel one). */
export const APPEARANCE_DEFAULTS = {
  groupLayout: 'list' as GroupLayout,
  gridColumns: 2,
  density: 'comfortable' as Density,
  hue: 214,
  intensity: 100,
  radius: 8,           // px — drives --radius (Tailwind rounded-*). 0 = sharp.
  reduceMotion: false,
  fontFamily: 'inter' as FontKey,
  uiScale: 1,          // 0.8-1.2, whole-UI zoom
};

interface SettingsState {
  groupLayout: GroupLayout;
  gridColumns: number;
  density: Density;
  hue: number;         // 0-360, accent hue
  intensity: number;   // 0-100, overall colour strength (0 = grayscale)
  radius: number;      // 0-16 px, UI corner roundness
  reduceMotion: boolean;
  fontFamily: FontKey;
  uiScale: number;     // 0.8-1.2 whole-UI zoom
  autoSync: boolean;

  setGroupLayout: (layout: GroupLayout) => void;
  setGridColumns: (columns: number) => void;
  setDensity: (density: Density) => void;
  setHue: (hue: number) => void;
  setIntensity: (intensity: number) => void;
  setRadius: (radius: number) => void;
  setReduceMotion: (reduceMotion: boolean) => void;
  setFontFamily: (fontFamily: FontKey) => void;
  setUiScale: (uiScale: number) => void;
  setAutoSync: (autoSync: boolean) => void;
  /** Restore appearance & layout to defaults (leaves autoSync untouched). */
  resetAppearance: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...APPEARANCE_DEFAULTS,
      autoSync: true,

      setGroupLayout: (groupLayout) => set({ groupLayout }),
      setGridColumns: (gridColumns) => set({ gridColumns }),
      setDensity: (density) => set({ density }),
      setHue: (hue) => set({ hue }),
      setIntensity: (intensity) => set({ intensity }),
      setRadius: (radius) => set({ radius }),
      setReduceMotion: (reduceMotion) => set({ reduceMotion }),
      setFontFamily: (fontFamily) => set({ fontFamily }),
      setUiScale: (uiScale) => set({ uiScale }),
      setAutoSync: (autoSync) => set({ autoSync }),
      resetAppearance: () => set({ ...APPEARANCE_DEFAULTS }),
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
