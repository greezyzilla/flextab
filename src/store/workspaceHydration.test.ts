import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

let disk: Record<string, unknown>;
// Every context's storage listener, so a write in one reaches the others like chrome.storage.onChanged.
let listeners: Array<(changes: Record<string, chrome.storage.StorageChange>, area: string) => void>;
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  disk = {};
  listeners = [];
  vi.mocked(chrome.storage.local.get).mockImplementation(async (key: any) => ({ [key]: disk[key] }));
  vi.mocked(chrome.storage.local.set).mockImplementation(async (values: any) => {
    const copy = structuredClone(values);
    Object.assign(disk, copy);
    const changes = Object.fromEntries(Object.entries(copy).map(([k, v]) => [k, { newValue: v }]));
    for (const listener of [...listeners]) listener(changes, "local");
  });
  vi.mocked(chrome.storage.onChanged.addListener).mockImplementation((fn: any) => { listeners.push(fn); });
});

/** A fresh extension context (new tab, popup or background): its own modules and its own Y.Doc. */
async function page() {
  vi.resetModules();
  const yjs = await import("~src/lib/yjsDoc");
  const store = await import("./useSavedSpacesStore");
  return { yjs, ...store };
}

async function background() {
  vi.resetModules();
  const yjs = await import("~src/lib/yjsDoc");
  const { seedFirstInstall } = await import("~src/services/firstInstall");
  return { yjs, seedFirstInstall };
}

/** The background's first-install seed. */
async function seedFromBackground() {
  const bg = await background();
  await bg.seedFirstInstall();
}

const stored = (yjs: typeof import("~src/lib/yjsDoc")) => yjs.decodeSpacesFromStorage(disk[yjs.PERSIST_KEY]);

describe("first install has one writer (TASK-127)", () => {
  it("ends with one Personal space when several pages open before the seed", async () => {
    const newTab = await page();
    const popup = await page();
    await Promise.all([newTab.hydrateYjs(), popup.hydrateYjs()]);
    // Pages never seed and never write an absent workspace.
    expect(newTab.yjs.getSpaces()).toEqual([]);
    expect(popup.yjs.getSpaces()).toEqual([]);
    expect(disk[newTab.yjs.PERSIST_KEY]).toBeUndefined();

    const bg = await background();
    expect(await bg.seedFirstInstall()).toBe(true);

    await vi.waitFor(() => expect(newTab.yjs.getSpaces()).toHaveLength(1));
    await vi.waitFor(() => expect(popup.yjs.getSpaces()).toHaveLength(1));
    const [space] = stored(bg.yjs);
    expect(stored(bg.yjs)).toHaveLength(1);
    expect(space.name).toBe("Personal");
    expect(space.projects.map(p => p.name)).toEqual(["General"]);
    expect(space.projects[0].categories.map(c => c.name)).toEqual(["Uncategorized"]);
    expect(newTab.yjs.getSpaces()).toEqual(stored(bg.yjs));
    expect(popup.yjs.getSpaces()).toEqual(stored(bg.yjs));
    // The page that waited selects the seed like a loaded workspace would.
    const s = newTab.useSavedSpacesStore.getState();
    expect([s.activeSpaceId, s.activeProjectId, s.activeCategoryId])
      .toEqual([space.id, space.projects[0].id, space.projects[0].categories[0].id]);
  });

  it("picks up a seed stored while the page was still loading", async () => {
    const p = await page();
    let seeded = false;
    // The page's first read sees nothing; the seed lands before its listener is installed.
    vi.mocked(chrome.storage.local.get).mockImplementation(async (key: any) => {
      const result = { [key]: disk[key] };
      if (!seeded && key === p.yjs.PERSIST_KEY) { seeded = true; const saved = listeners; listeners = []; await seedFromBackground(); listeners = saved; }
      return result;
    });
    await p.hydrateYjs();
    await vi.waitFor(() => expect(p.yjs.getSpaces()).toHaveLength(1));
    expect(p.yjs.getSpaces()).toEqual(stored(p.yjs));
  });

  it("opens a seeded workspace as it was, without seeding again", async () => {
    await seedFromBackground();
    const first = stored((await page()).yjs);
    const p = await page();
    await p.hydrateYjs();
    expect(p.yjs.getSpaces()).toEqual(first);
    const bg = await background();
    expect(await bg.seedFirstInstall()).toBe(false);
    expect(stored(bg.yjs)).toEqual(first);
  });

  it("never seeds over a stored empty workspace", async () => {
    const bg = await background();
    disk[bg.yjs.PERSIST_KEY] = bg.yjs.encodeSpacesAsStorage([]);
    expect(await bg.seedFirstInstall()).toBe(false);
    expect(stored(bg.yjs)).toEqual([]);
  });

  it.each(["read failure", "corrupt bytes", "missing with history"])("never seeds on %s", async reason => {
    const bg = await background();
    if (reason === "read failure") vi.mocked(chrome.storage.local.get).mockRejectedValue(new Error("Disk unavailable"));
    if (reason === "corrupt bytes") disk[bg.yjs.PERSIST_KEY] = [255];
    if (reason === "missing with history") disk.flextab_merge_base = [];
    const before = structuredClone(disk);
    expect(await bg.seedFirstInstall()).toBe(false);
    expect(disk).toEqual(before);
  });
});

describe("workspace hydration distinguishes absent, empty, and unreadable", () => {
  it("keeps deletion of the last space empty after an offline page reload", async () => {
    await seedFromBackground();
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
