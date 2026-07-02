import { describe, it, expect, beforeEach, vi } from "vitest";
import { getMergeBase, setMergeBase, clearMergeBase } from "./mergeBase";
import type { SavedSpace } from "~src/types";

const space = (id: string, name: string): SavedSpace => ({ id, name, order: 0, projects: [] });

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
});
