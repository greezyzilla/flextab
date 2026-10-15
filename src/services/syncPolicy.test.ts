import { describe, it, expect, vi } from "vitest";
import { automaticPushAllowed, SETTINGS_KEY, storedAutoSync, withSyncWriteLock } from "./syncPolicy";

describe("automatic sync policy", () => {
  it.each([
    [undefined, true], [JSON.stringify({ state: {} }), true],
    [JSON.stringify({ state: { autoSync: true } }), true],
    [JSON.stringify({ state: { autoSync: false } }), false],
    [JSON.stringify({ state: { autoSync: "true" } }), false],
    [null, false], ["broken", false], ["{}", false], ["null", false],
    [JSON.stringify({ state: "bad" }), false], [JSON.stringify({ state: [] }), false],
  ])("decodes saved preference %j as %s", (input, expected) => {
    expect(storedAutoSync(input)).toBe(expected);
  });
  it("requires both enabled settings and completed hydration", async () => {
    const disk: Record<string, unknown> = { [SETTINGS_KEY]: JSON.stringify({ state: { autoSync: false } }), flextab_sync_hydrated: true };
    vi.mocked(chrome.storage.local.get).mockImplementation(async (key: any) => ({ [key]: disk[key] }));
    expect(await automaticPushAllowed()).toBe(false);
    disk[SETTINGS_KEY] = JSON.stringify({ state: { autoSync: true } });
    expect(await automaticPushAllowed()).toBe(true);
    delete disk.flextab_sync_hydrated;
    expect(await automaticPushAllowed()).toBe(false);
  });
  it("fails closed on storage failure", async () => {
    vi.mocked(chrome.storage.local.get).mockRejectedValue(new Error("disk unavailable"));
    expect(await automaticPushAllowed()).toBe(false);
  });
  it("coordinates callers using the same browser-wide write lock", async () => {
    const request = vi.fn(async (_name: string, work: () => Promise<unknown>) => work());
    Object.defineProperty(navigator, "locks", { value: { request }, configurable: true });
    try {
      expect(await withSyncWriteLock(async () => 42)).toBe(42);
      expect(request).toHaveBeenCalledWith("flextab-structured-sync", expect.any(Function));
    } finally { Reflect.deleteProperty(navigator, "locks"); }
  });
});
