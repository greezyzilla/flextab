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
