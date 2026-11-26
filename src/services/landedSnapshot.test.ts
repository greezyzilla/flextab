import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SavedSpace } from "~src/types";
import { doc, setSpaces, getSpaces, decodeSpacesFromStorage, PERSIST_KEY, persistState } from "~src/lib/yjsDoc";
import { recordLandedSnapshot, applyPendingLandedSnapshot, LANDED_SNAPSHOT_KEY } from "./landedSnapshot";
import { clearMergeBase, getMergeBase, setMergeBase } from "./mergeBase";
import { CONFLICT_PENDING_KEY, OCC_CONFLICT_PAYLOAD_KEY } from "./conflictState";

const space = (id: string, name = id): SavedSpace => ({ id, name, order: 0, projects: [] });
let disk: Record<string, any>;
beforeEach(async () => {
  vi.clearAllMocks();
  disk = {};
  vi.mocked(chrome.storage.local.get).mockImplementation(async (key: any) => ({ [key]: disk[key] }));
  vi.mocked(chrome.storage.local.set).mockImplementation(async (items: any) => { Object.assign(disk, structuredClone(items)); });
  vi.mocked(chrome.storage.local.remove).mockImplementation(async (keys: any) => {
    for (const key of Array.isArray(keys) ? keys : [keys]) delete disk[key];
  });
  setSpaces([]);
  doc.getMap("sync").clear();
  await clearMergeBase();
});

describe("production landed acknowledgement", () => {
  it("acknowledges A without replacing a newer persisted edit B", async () => {
    const a = [space("a")];
    const b = [space("a", "new title"), space("b")];
    setSpaces(b);
    await persistState();
    const bytes = disk[PERSIST_KEY];
    await recordLandedSnapshot(a, a);
    expect(disk[PERSIST_KEY]).toEqual(bytes);
    expect(getSpaces()).toEqual(b);
    expect(await getMergeBase()).toEqual(a);
    expect(disk[LANDED_SNAPSHOT_KEY]).toBeUndefined();
  });

  it("defers OCC writeback, then rebases peer changes onto the latest live edits", async () => {
    const a = [space("a")];
    const landed = [space("a"), space("peer")];
    await setMergeBase(a);
    await recordLandedSnapshot(landed, a);
    expect(disk[PERSIST_KEY]).toBeUndefined();
    expect(await getMergeBase()).toEqual(a); // don't advance before local application
    setSpaces([space("a", "edited during HTTP"), space("new")]);
    await applyPendingLandedSnapshot();
    expect(getSpaces().map(s => [s.id, s.name])).toEqual([
      ["a", "edited during HTTP"], ["peer", "peer"], ["new", "new"],
    ]);
    expect(decodeSpacesFromStorage(disk[PERSIST_KEY])).toEqual(getSpaces());
    expect(await getMergeBase()).toEqual(landed);
    expect(disk[LANDED_SNAPSHOT_KEY]).toBeUndefined();
  });

  it("reads live edits after the asynchronous receipt lookup, preserving deletes and metadata", async () => {
    const a = [space("a"), space("delete")];
    await recordLandedSnapshot([...a, space("peer")], a);
    const get = vi.mocked(chrome.storage.local.get);
    get.mockImplementationOnce(async () => {
      setSpaces([{ ...space("a"), color: "blue", icon: "star", abbreviation: "B" }]);
      return { [LANDED_SNAPSHOT_KEY]: disk[LANDED_SNAPSHOT_KEY] };
    });
    await applyPendingLandedSnapshot();
    expect(getSpaces().map(s => s.id)).toEqual(["a", "peer"]);
    expect(getSpaces()[0]).toMatchObject({ color: "blue", icon: "star", abbreviation: "B" });
  });

  it("retains the receipt and old base when persistence fails; retries idempotently", async () => {
    const a = [space("a")];
    const landed = [...a, space("peer")];
    await setMergeBase(a);
    await recordLandedSnapshot(landed, a);
    setSpaces(a);
    vi.mocked(chrome.storage.local.set).mockRejectedValueOnce(new Error("disk full"));
    await expect(applyPendingLandedSnapshot()).rejects.toThrow("disk full");
    expect(disk[LANDED_SNAPSHOT_KEY]).toBeDefined();
    expect(await getMergeBase()).toEqual(a);
    // User removes the newly merged item before retry. Receipt marker prevents resurrection.
    setSpaces(a);
    await applyPendingLandedSnapshot();
    expect(getSpaces()).toEqual(a);
    expect(decodeSpacesFromStorage(disk[PERSIST_KEY])).toEqual(a);
    expect(await getMergeBase()).toEqual(landed);
    expect(disk[LANDED_SNAPSHOT_KEY]).toBeUndefined();
  });

  it("defers a late edit-edit conflict without changing local data", async () => {
    const a = [space("a", "base")];
    await setMergeBase(a);
    await recordLandedSnapshot([space("a", "peer")], a);
    setSpaces([space("a", "new local")]);
    await applyPendingLandedSnapshot();
    expect(getSpaces()[0].name).toBe("new local");
    expect(disk[CONFLICT_PENDING_KEY]).toBe(true);
    expect(disk[OCC_CONFLICT_PAYLOAD_KEY].conflicts).toHaveLength(1);
    expect(await getMergeBase()).toEqual(a);
    expect(disk[LANDED_SNAPSHOT_KEY]).toBeUndefined();
  });

  it("keeps the receipt when saving the merge-base fails", async () => {
    const a = [space("a")];
    await setMergeBase(a);
    await recordLandedSnapshot([...a, space("peer")], a);
    setSpaces(a);
    const write = vi.mocked(chrome.storage.local.set).getMockImplementation()!;
    vi.mocked(chrome.storage.local.set).mockImplementation(async (items: any) => {
      if (items.flextab_merge_base) throw new Error("base write failed");
      return (write as any)(items);
    });
    await expect(applyPendingLandedSnapshot()).rejects.toThrow("base write failed");
    expect(disk[LANDED_SNAPSHOT_KEY]).toBeDefined();
    expect(await getMergeBase()).toEqual(a);
    expect(decodeSpacesFromStorage(disk[PERSIST_KEY]).map(s => s.id)).toEqual(["a", "peer"]);
    vi.mocked(chrome.storage.local.set).mockImplementation(write);
    await applyPendingLandedSnapshot();
    expect(disk[LANDED_SNAPSHOT_KEY]).toBeUndefined();
  });

  it("retains the receipt if persisting a late conflict fails", async () => {
    const a = [space("a", "base")];
    await recordLandedSnapshot([space("a", "peer")], a);
    setSpaces([space("a", "local")]);
    vi.mocked(chrome.storage.local.set).mockRejectedValueOnce(new Error("disk full"));
    await expect(applyPendingLandedSnapshot()).rejects.toThrow("disk full");
    expect(disk[LANDED_SNAPSHOT_KEY]).toBeDefined();
    expect(getSpaces()[0].name).toBe("local");
    await applyPendingLandedSnapshot();
    expect(disk[CONFLICT_PENDING_KEY]).toBe(true);
    expect(disk[LANDED_SNAPSHOT_KEY]).toBeUndefined();
  });

  it("uses the shared browser lock before reading a receipt", async () => {
    const request = vi.fn(async (_name: string, run: () => Promise<void>) => run());
    Object.defineProperty(navigator, "locks", { configurable: true, value: { request } });
    try {
      const a = [space("a")];
      await recordLandedSnapshot([...a, space("peer")], a);
      setSpaces(a);
      await applyPendingLandedSnapshot();
      expect(request).toHaveBeenCalledWith("flextab-structured-sync", expect.any(Function));
      expect(request).toHaveBeenCalledWith("flextab-landed-snapshot", expect.any(Function));
    } finally {
      Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
    }
  });

  it("coalesces concurrent consumers in one page", async () => {
    const a = [space("a")];
    await recordLandedSnapshot([...a, space("peer")], a);
    setSpaces(a);
    const first = applyPendingLandedSnapshot();
    expect(applyPendingLandedSnapshot()).toBe(first);
    await first;
    expect(getSpaces().map(s => s.id)).toEqual(["a", "peer"]);
  });
});
