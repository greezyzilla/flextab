/**
 * Light / dark mode (TASK-16). "system" follows the OS through the
 * `prefers-color-scheme` media query in style.css, so it needs no class and
 * no script. "light" / "dark" force a theme with a class on <html>.
 *
 * The settings store lives in chrome.storage, which is async, so the choice is
 * mirrored to localStorage (same extension origin for the new tab and the
 * popup) and applied synchronously before the first render. Without that, a
 * forced theme that differs from the OS would flash on every new tab.
 */
import type { Density, FontKey } from "~src/store/useSettingsStore";

export type ThemeMode = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "flextab-theme";

export function applyThemeMode(mode: ThemeMode, root: HTMLElement = document.documentElement) {
  root.classList.toggle("light", mode === "light");
  root.classList.toggle("dark", mode === "dark");
}

export function readStoredThemeMode(): ThemeMode {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

export function storeThemeMode(mode: ThemeMode) {
  try {
    if (mode === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Storage blocked: the theme still applies for this page from the store.
  }
}

/**
 * Appearance (hue, intensity, corners, font, scale, density, motion) follows the same rule as the
 * mode: the store is async, so the last applied values are mirrored to localStorage and put on <html>
 * before the first render. Without that the loading shell and the first frame draw in the default
 * blue and default sizes, then switch to the user's look when the settings arrive.
 */
export type Appearance = {
  hue: number;
  intensity: number;
  groupTint: number;
  radius: number;
  fontFamily: FontKey;
  uiScale: number;
  density: Density;
  reduceMotion: boolean;
};

export const APPEARANCE_STORAGE_KEY = "flextab-appearance";

const DENSITY_CLASSES = ["density-compact", "density-cozy", "density-comfortable"];

const FONT_STACKS: Record<FontKey, string> = {
  inter: '"Inter Variable", Inter, system-ui, -apple-system, sans-serif',
  system: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  rounded: 'ui-rounded, "SF Pro Rounded", "Nunito", "Quicksand", system-ui, sans-serif',
  serif: 'Georgia, Cambria, "Times New Roman", ui-serif, serif',
  mono: 'ui-monospace, "SF Mono", "Cascadia Code", Menlo, monospace',
};

export function applyAppearance(a: Appearance, root: HTMLElement = document.documentElement) {
  root.style.setProperty("--hue", String(a.hue));
  root.style.setProperty("--intensity", String(a.intensity));
  root.style.setProperty("--group-tint", String(a.groupTint));
  root.style.setProperty("--radius", `${a.radius}px`);
  root.style.setProperty("--font-sans", FONT_STACKS[a.fontFamily] ?? FONT_STACKS.inter);
  // UI scale = scale the rem base, so all rem-based sizing (Tailwind spacing,
  // text, widths) scales proportionally like a multiplier — the layout reflows
  // and viewport (vw/vh) containers still fill the window. NOT `zoom`, which is
  // a viewport zoom that left white gaps below 100% and just zoomed in above.
  root.style.fontSize = `${a.uiScale * 100}%`;
  root.style.removeProperty("zoom"); // clear any value from the old approach
  root.classList.remove(...DENSITY_CLASSES);
  root.classList.add(`density-${a.density}`);
  root.classList.toggle("reduce-motion", a.reduceMotion);
}

export function readStoredAppearance(): Appearance | null {
  try {
    const raw = localStorage.getItem(APPEARANCE_STORAGE_KEY);
    if (!raw) return null;
    const a = JSON.parse(raw) as Partial<Appearance>;
    const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);
    if (!num(a.hue) || !num(a.intensity) || !num(a.groupTint) || !num(a.radius) || !num(a.uiScale)) return null;
    if (typeof a.fontFamily !== "string" || !(a.fontFamily in FONT_STACKS)) return null;
    if (!DENSITY_CLASSES.includes(`density-${a.density}`) || typeof a.reduceMotion !== "boolean") return null;
    return a as Appearance;
  } catch {
    return null;
  }
}

export function storeAppearance(a: Appearance) {
  try {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(a));
  } catch {
    // Storage blocked: the look still applies for this page from the store.
  }
}
