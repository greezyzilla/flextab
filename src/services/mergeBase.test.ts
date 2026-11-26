import { describe, it, expect, beforeEach, vi } from "vitest";
import { getMergeBase, setMergeBase, clearMergeBase } from "./mergeBase";
import type { SavedSpace } from "~src/types";

const space = (id: string, name: string): SavedSpace => ({ id, name, order: 0, projects: [] });

// The module registers its storage listener at import; take it before any
// clearAllMocks wipes the recorded calls.
type StorageListener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => void;
const onStorageChanged = (chrome.storage.onChanged.addListener as any).mock.calls.at(-1)[0] as StorageListener;

describe("merge-base store", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    (chrome.storage.local.get as any).mockResolvedValue({});
    await clearMergeBase(); // reset in-memory cache
  });

  it("returns null when nothing is stored", async () => {
    (chrome.storage.local.get as any).mockResolvedValue({});
    expect(await getMergeBase()).toBeNull();
  });

  it("reads a stored spaces array", async () => {
    const spaces = [space("s", "Work")];
    (chrome.storage.local.get as any).mockResolvedValue({ flextab_merge_base: spaces });
    expect(await getMergeBase()).toEqual(spaces);
  });

  it("ignores a non-array stored value", async () => {
    (chrome.storage.local.get as any).mockResolvedValue({ flextab_merge_base: "x" });
    expect(await getMergeBase()).toBeNull();
  });

  it("returns null when storage throws", async () => {
    (chrome.storage.local.get as any).mockRejectedValue(new Error("no ctx"));
    expect(await getMergeBase()).toBeNull();
  });

  it("persists and is served from cache", async () => {
    const spaces = [space("s", "Work")];
    await setMergeBase(spaces);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ flextab_merge_base: spaces });
    (chrome.storage.local.get as any).mockResolvedValue({}); // cache should win
    expect(await getMergeBase()).toEqual(spaces);
  });

  it("deep-clones on set so later mutation can't change the base", async () => {
    const spaces = [space("s", "Work")];
    await setMergeBase(spaces);
    spaces[0].name = "mutated";
    const base = await getMergeBase();
    expect(base![0].name).toBe("Work");
  });

  it("clearMergeBase removes the key and resets the cache", async () => {
    await setMergeBase([space("s", "Work")]);
    await clearMergeBase();
    expect(chrome.storage.local.remove).toHaveBeenCalledWith("flextab_merge_base");
    (chrome.storage.local.get as any).mockResolvedValue({});
    expect(await getMergeBase()).toBeNull();
  });

  it("keeps the base in memory when a best-effort write fails", async () => {
    (chrome.storage.local.set as any).mockRejectedValueOnce(new Error("quota"));
    const spaces = [space("s", "Work")];
    await expect(setMergeBase(spaces)).resolves.toBeUndefined();
    expect(await getMergeBase()).toEqual(spaces);
  });

  it("fails a durable write when storage refuses it, and keeps the old base", async () => {
    await setMergeBase([space("old", "Old")]);
    (chrome.storage.local.set as any).mockRejectedValueOnce(new Error("quota"));
    await expect(setMergeBase([space("new", "New")], true)).rejects.toThrow("quota");
    expect((await getMergeBase())![0].id).toBe("old");
  });

  it("follows a base written by another context", async () => {
    const fromWorker = [space("w", "From worker")];
    onStorageChanged({ flextab_merge_base: { newValue: fromWorker } }, "local");
    (chrome.storage.local.get as any).mockResolvedValue({});
    expect(await getMergeBase()).toEqual(fromWorker);
  });

  it("forgets the base when another context removes it", async () => {
    await setMergeBase([space("s", "Work")]);
    onStorageChanged({ flextab_merge_base: { oldValue: [], newValue: undefined } }, "local");
    expect(await getMergeBase()).toBeNull();
  });

  it("ignores changes to other keys and other storage areas", async () => {
    const spaces = [space("s", "Work")];
    await setMergeBase(spaces);
    onStorageChanged({ other_key: { newValue: 1 } }, "local");
    onStorageChanged({ flextab_merge_base: { newValue: [] } }, "sync");
    expect(await getMergeBase()).toEqual(spaces);
  });
});

describe("merge-base store without an extension context", () => {
  it("loads and works when chrome.storage has no change events", async () => {
    vi.resetModules();
    const saved = chrome.storage.onChanged;
    (chrome.storage as any).onChanged = undefined;
    try {
      const mod = await import("./mergeBase");
      await mod.setMergeBase([space("s", "Work")]);
      expect((await mod.getMergeBase())![0].id).toBe("s");
    } finally {
      (chrome.storage as any).onChanged = saved;
    }
  });
});

