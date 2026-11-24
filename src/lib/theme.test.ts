import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { APPEARANCE_STORAGE_KEY, applyAppearance, applyStoredLook, applyThemeMode, readStoredAppearance, readStoredThemeMode, storeThemeMode, THEME_STORAGE_KEY } from "./theme";
import { useTheme } from "~src/hooks/useTheme";
import { useSettingsStore } from "~src/store/useSettingsStore";

const root = document.documentElement;
afterEach(() => {
  cleanup();
  localStorage.clear();
  root.classList.remove("light", "dark");
  vi.restoreAllMocks();
});

describe("theme mode", () => {
  it("forces light or dark with a class and leaves system to the media query", () => {
    applyThemeMode("light");
    expect([...root.classList]).toContain("light");
    applyThemeMode("dark");
    expect(root.classList.contains("light")).toBe(false);
    expect(root.classList.contains("dark")).toBe(true);
    applyThemeMode("system");
    expect(root.classList.contains("light") || root.classList.contains("dark")).toBe(false);
  });

  it("mirrors a forced choice to localStorage and forgets it for system", () => {
    expect(readStoredThemeMode()).toBe("system");
    storeThemeMode("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(readStoredThemeMode()).toBe("dark");
    storeThemeMode("system");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    localStorage.setItem(THEME_STORAGE_KEY, "sepia");
    expect(readStoredThemeMode()).toBe("system");
  });

  it("falls back to system when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(readStoredThemeMode()).toBe("system");
    expect(() => storeThemeMode("light")).not.toThrow();
  });

  it("applies and mirrors the setting from the store", () => {
    useSettingsStore.setState({ theme: "light" });
    const { rerender } = renderHook(() => useTheme());
    expect(root.classList.contains("light")).toBe(true);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    useSettingsStore.setState({ theme: "system" });
    rerender();
    expect(root.classList.contains("light")).toBe(false);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it("keeps the System (media query) and Light (class) token blocks identical", () => {
    const css = readFileSync(resolve(__dirname, "../../style.css"), "utf8");
    const body = (re: RegExp) => (css.match(re)?.[1] ?? "").split("\n").map(l => l.trim()).filter(Boolean);
    const media = body(/@media \(prefers-color-scheme: light\) \{\s*:root:not\(\.dark\) \{([^}]*)\}/);
    const forced = body(/\n {2}:root\.light \{([^}]*)\}/);
    expect(media.length).toBeGreaterThan(10);
    expect(forced).toEqual(media);
  });

  it("tells the browser the theme, so native scrollbars and controls follow it", () => {
    const css = readFileSync(resolve(__dirname, "../../style.css"), "utf8");
    expect(css).toMatch(/@layer theme \{\s*:root \{[^}]*color-scheme: dark;/);
    expect(css).toMatch(/:root:not\(\.dark\) \{\s*color-scheme: light;/);
    expect(css).toMatch(/\n {2}:root\.light \{\s*color-scheme: light;/);
  });
});

describe("appearance before the first render", () => {
  const green = { hue: 145, intensity: 80, groupTint: 35, radius: 10, fontFamily: "rounded" as const, uiScale: 1.1, density: "cozy" as const, reduceMotion: true, appIcon: "accent" as const };

  it("is mirrored by useTheme, so the next page reads the user's look, not the default blue", () => {
    useSettingsStore.setState({ hue: 145, intensity: 80, radius: 10, fontFamily: "rounded", uiScale: 1.1, density: "cozy", reduceMotion: true });
    renderHook(() => useTheme());
    expect(readStoredAppearance()).toEqual({ ...green, groupTint: useSettingsStore.getState().groupTint });
  });

  it("puts every value on <html>", () => {
    applyAppearance(green);
    expect(root.style.getPropertyValue("--hue")).toBe("145");
    expect(root.style.getPropertyValue("--radius")).toBe("10px");
    expect(parseFloat(root.style.fontSize)).toBeCloseTo(110);
    expect(root.classList.contains("density-cozy")).toBe(true);
    expect(root.classList.contains("reduce-motion")).toBe(true);
  });

  it("ignores a missing, broken or partial copy", () => {
    expect(readStoredAppearance()).toBeNull();
    localStorage.setItem(APPEARANCE_STORAGE_KEY, "{not json");
    expect(readStoredAppearance()).toBeNull();
    localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify({ hue: 145 }));
    expect(readStoredAppearance()).toBeNull();
    localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify({ ...green, density: "huge" }));
    expect(readStoredAppearance()).toBeNull();
  });

  it("reads a copy written before the app icon choice as Follow accent", () => {
    const { appIcon: _drop, ...old } = green;
    localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(old));
    expect(readStoredAppearance()?.appIcon).toBe("accent");
  });

  it("puts the stored look on <html> in one call, or the defaults on first run (the boot script)", () => {
    applyStoredLook();
    expect(root.style.getPropertyValue("--hue")).toBe("214");
    expect(root.classList.contains("density-cozy")).toBe(true); // the default density is Cozy
    localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(green));
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    applyStoredLook();
    expect(root.style.getPropertyValue("--hue")).toBe("145");
    expect(root.classList.contains("dark")).toBe(true);
  });
});
