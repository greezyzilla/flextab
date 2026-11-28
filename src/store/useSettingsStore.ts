import type { LinkCutScope } from "~src/lib/displayUrl";
import type { IconWeight } from "~src/components/ui/icon";
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { storage } from './syncStorage';
import { DEFAULT_APPEARANCE, readStoredThemeMode, type AppIcon, type ThemeMode } from '~src/lib/theme';

export type GroupLayout = 'list' | 'grid';
export type Density = 'compact' | 'cozy' | 'comfortable';
export type FontKey = 'inter' | 'system' | 'rounded' | 'serif' | 'mono';
/** How a tab saved twice in the same group is marked. */
export type DuplicateMark = 'ribbon' | 'icon' | 'off';
export type DuplicateTone = 'caution' | 'accent' | 'neutral';
export type DuplicateCorner = 'right' | 'left';
export type DuplicateLabel = 'dupe' | 'count';
/** When a cut saved tab shows its full title and link: as you point, or only while Alt is held. */
export type TabPreview = 'hover' | 'alt';

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
  theme: 'system' as ThemeMode, // follow the OS; Light/Dark force one (device-only, not synced)
  groupLayout: 'grid' as GroupLayout, // groups side by side: more of the workspace in one look
  gridColumns: 2,
  // density, hue, intensity, groupTint (0-100 coloured group tint), radius (px, drives
  // --radius), reduceMotion, fontFamily, uiScale (0.8-1.2) and appIcon: one source with
  // the look the loading pages paint before the store loads (lib/theme.ts).
  ...DEFAULT_APPEARANCE,
  titleCut: 50,        // 0-100, where "…" sits in a cut saved tab title
  linkCut: 50,         // 0-100, where "…" sits in a cut saved tab link
  linkCutScope: 'all' as LinkCutScope, // which part of the link is cut: all, site or path
  tabPreview: 'hover' as TabPreview, // full title + link of a cut tab: on hover, or only while Alt is held
  iconWeight: 'regular' as IconWeight, // stroke of every icon: thin 1.5, regular 1.75, bold 2
  duplicateMark: 'ribbon' as DuplicateMark,
  duplicateTone: 'caution' as DuplicateTone,
  duplicateCorner: 'right' as DuplicateCorner,  // ribbon only
  duplicateLabel: 'dupe' as DuplicateLabel,     // ribbon only
};

interface SettingsState {
  theme: ThemeMode;
  groupLayout: GroupLayout;
  gridColumns: number;
  density: Density;
  hue: number;         // 0-360, accent hue
  intensity: number;   // 0-100, overall colour strength (0 = grayscale)
  groupTint: number;   // 0-100, coloured group card tint
  radius: number;      // 0-16 px, UI corner roundness
  reduceMotion: boolean;
  fontFamily: FontKey;
  uiScale: number;     // 0.8-1.2 whole-UI zoom
  appIcon: AppIcon;    // the app icon in the accent, or the manifest blue
  titleCut: number;    // 0-100, "…" position in a cut saved tab title: 0 keeps the end, 100 the start
  linkCut: number;     // 0-100, the same for a saved tab link
  linkCutScope: LinkCutScope; // which part of the link gives way first
  tabPreview: TabPreview;      // when a cut tab's full title and link show
  iconWeight: IconWeight;      // stroke weight of every icon
  duplicateMark: DuplicateMark;
  duplicateTone: DuplicateTone;
  duplicateCorner: DuplicateCorner;
  duplicateLabel: DuplicateLabel;
  autoSync: boolean;
  /** Open all gives a group back as a browser tab group. Device-only:
   *  the `tabGroups` permission it needs is per browser, so it is not synced to
   *  the account and Reset appearance leaves it alone. */
  openAsTabGroups: boolean;

  setTheme: (theme: ThemeMode) => void;
  setGroupLayout: (layout: GroupLayout) => void;
  setGridColumns: (columns: number) => void;
  setDensity: (density: Density) => void;
  setHue: (hue: number) => void;
  setIntensity: (intensity: number) => void;
  setGroupTint: (groupTint: number) => void;
  setRadius: (radius: number) => void;
  setReduceMotion: (reduceMotion: boolean) => void;
  setFontFamily: (fontFamily: FontKey) => void;
  setUiScale: (uiScale: number) => void;
  setAppIcon: (appIcon: AppIcon) => void;
  setTitleCut: (titleCut: number) => void;
  setLinkCut: (linkCut: number) => void;
  setLinkCutScope: (linkCutScope: LinkCutScope) => void;
  setTabPreview: (tabPreview: TabPreview) => void;
  setIconWeight: (iconWeight: IconWeight) => void;
  setDuplicateMark: (duplicateMark: DuplicateMark) => void;
  setDuplicateTone: (duplicateTone: DuplicateTone) => void;
  setDuplicateCorner: (duplicateCorner: DuplicateCorner) => void;
  setDuplicateLabel: (duplicateLabel: DuplicateLabel) => void;
  setAutoSync: (autoSync: boolean) => void;
  setOpenAsTabGroups: (openAsTabGroups: boolean) => void;
  /** Restore appearance & layout to defaults (leaves autoSync untouched). */
  resetAppearance: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...APPEARANCE_DEFAULTS,
      // Start from the mirrored choice so the pre-hydration render keeps the
      // theme the entry already applied (see lib/theme.ts).
      theme: readStoredThemeMode(),
      autoSync: true,
      openAsTabGroups: true, // asked for on the first Open all; declining turns it off

      setTheme: (theme) => set({ theme }),

      setGroupLayout: (groupLayout) => set({ groupLayout }),
      setGridColumns: (gridColumns) => set({ gridColumns }),
      setDensity: (density) => set({ density }),
      setHue: (hue) => set({ hue }),
      setIntensity: (intensity) => set({ intensity }),
      setGroupTint: (groupTint) => set({ groupTint }),
      setRadius: (radius) => set({ radius }),
      setReduceMotion: (reduceMotion) => set({ reduceMotion }),
      setFontFamily: (fontFamily) => set({ fontFamily }),
      setUiScale: (uiScale) => set({ uiScale }),
      setAppIcon: (appIcon) => set({ appIcon }),
      setTitleCut: (titleCut) => set({ titleCut }),
      setLinkCut: (linkCut) => set({ linkCut }),
      setLinkCutScope: (linkCutScope) => set({ linkCutScope }),
      setTabPreview: (tabPreview) => set({ tabPreview }),
      setIconWeight: (iconWeight) => set({ iconWeight }),
      setDuplicateMark: (duplicateMark) => set({ duplicateMark }),
      setDuplicateTone: (duplicateTone) => set({ duplicateTone }),
      setDuplicateCorner: (duplicateCorner) => set({ duplicateCorner }),
      setDuplicateLabel: (duplicateLabel) => set({ duplicateLabel }),
      setAutoSync: (autoSync) => set({ autoSync }),
      setOpenAsTabGroups: (openAsTabGroups) => set({ openAsTabGroups }),
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
        // Persist merges these stored fields with the live state/actions.
        return s as unknown as SettingsState;
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

// Keep every setting consistent across open extension pages: the automatic-sync
// preference, and the look, so an accent picked in one tab repaints the
// others at once, and a page left open never writes its old values back over a
// newer choice. Rehydrate from the current durable record rather than re-saving an
// old event; a page's own write matches its state and changes nothing.
chrome.storage?.onChanged?.addListener((changes, area) => {
  if (area !== "local" || !changes["flextab-settings"]?.newValue) return;
  try {
    const stored = JSON.parse(changes["flextab-settings"].newValue as string)?.state as Record<string, unknown> | undefined;
    if (!stored) return;
    const current = useSettingsStore.getState() as unknown as Record<string, unknown>;
    const stale = Object.entries(stored).some(([key, value]) =>
      key !== "lastModified" && typeof current[key] !== "function" && JSON.stringify(value) !== JSON.stringify(current[key]));
    if (stale) void useSettingsStore.persist.rehydrate();
  } catch { /* Worker treats malformed settings as paused. */ }
});
