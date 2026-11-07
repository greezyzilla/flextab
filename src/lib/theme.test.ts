import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { applyThemeMode, readStoredThemeMode, storeThemeMode, THEME_STORAGE_KEY } from "./theme";
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
});
