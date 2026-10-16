import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

let disk: Record<string, unknown>;
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  disk = {};
  vi.mocked(chrome.storage.local.get).mockImplementation(async (key: any) => ({ [key]: disk[key] }));
  vi.mocked(chrome.storage.local.set).mockImplementation(async (values: any) => { Object.assign(disk, structuredClone(values)); });
});

async function page() {
  const yjs = await import("~src/lib/yjsDoc");
  const store = await import("./useSavedSpacesStore");
  return { yjs, ...store };
}

describe("workspace hydration distinguishes absent, empty, and unreadable", () => {
  it("seeds and persists defaults only on a fresh installation", async () => {
    const p = await page();
    await p.hydrateYjs();
    const spaces = p.yjs.getSpaces();
    expect(spaces).toHaveLength(1);
    expect(spaces[0].name).toBe("Personal");
    expect(p.yjs.decodeSpacesFromStorage(disk[p.yjs.PERSIST_KEY])).toEqual(spaces);
    vi.resetModules();
    const reopened = await page();
    await reopened.hydrateYjs();
    expect(reopened.yjs.getSpaces()).toEqual(spaces);
  });

  it("keeps deletion of the last space empty after an offline page reload", async () => {
    const p = await page();
    await p.hydrateYjs();
    p.useSavedSpacesStore.getState().removeSavedSpace(p.yjs.getSpaces()[0]);
    await p.yjs.persistState();
    vi.resetModules();
    const reopened = await page();
    await reopened.hydrateYjs();
    expect(reopened.yjs.getSpaces()).toEqual([]);
    const s = reopened.useSavedSpacesStore.getState();
    expect([s.activeSpaceId, s.activeProjectId, s.activeCategoryId]).toEqual([null, null, null]);
    expect(reopened.yjs.decodeSpacesFromStorage(disk[reopened.yjs.PERSIST_KEY])).toEqual([]);
  });

  it.each(["page", "snapshot", "legacy"])("keeps a persisted empty %s workspace empty", async origin => {
    const p = await page();
    const data = p.yjs.encodeSpacesAsStorage([]);
    disk[p.yjs.PERSIST_KEY] = origin === "legacy" ? data : { version: 1, origin, data };
    await p.hydrateYjs();
    expect(p.yjs.getSpaces()).toEqual([]);
  });

  it.each(["read failure", "corrupt bytes", "missing with history"])("blocks hydration on %s and can retry without resetting data", async reason => {
    const p = await page();
    if (reason === "read failure") vi.mocked(chrome.storage.local.get).mockImplementation(async (key: any) => {
      if (key === p.yjs.PERSIST_KEY) throw new Error("Disk unavailable");
      return { [key]: disk[key] };
    });
    if (reason === "corrupt bytes") disk[p.yjs.PERSIST_KEY] = [255];
    if (reason === "missing with history") disk.flextab_merge_base = [];
    const before = structuredClone(disk);
    await expect(p.hydrateYjs()).rejects.toThrow();
    expect(p.yjs.getSpaces()).toEqual([]);
    expect(disk[p.yjs.PERSIST_KEY]).toEqual(before[p.yjs.PERSIST_KEY]);
    vi.mocked(chrome.storage.local.get).mockImplementation(async (key: any) => ({ [key]: disk[key] }));
    disk[p.yjs.PERSIST_KEY] = p.yjs.encodeSpacesAsStorage([]);
    await p.hydrateYjs();
    expect(p.yjs.getSpaces()).toEqual([]);
  });

  it("surfaces hydration failure to the UI while keeping it unhydrated", async () => {
    const p = await page();
    disk[p.yjs.PERSIST_KEY] = [255];
    const { result } = renderHook(() => p.useHydrated());
    await waitFor(() => expect(result.current).toEqual({ hydrated: false, error: true }));
    expect(disk[p.yjs.PERSIST_KEY]).toEqual([255]);
  });
});
