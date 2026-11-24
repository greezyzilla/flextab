import { describe, it, expect, vi } from "vitest";
import {
  automaticPushAllowed, clearResolutionPush, markResolutionPush, pendingResolutionPush, PUSH_REQUEST_KEY, requestPush,
  RESOLUTION_PUSH_KEY, SETTINGS_KEY, storedAutoSync, withSyncWriteLock,
} from "./syncPolicy";

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
  it("asks the worker to upload now, and tolerates storage failure", async () => {
    vi.mocked(chrome.storage.local.set).mockResolvedValue(undefined);
    await requestPush();
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ [PUSH_REQUEST_KEY]: expect.any(Number) });
    vi.mocked(chrome.storage.local.set).mockRejectedValueOnce(new Error("no ctx"));
    await expect(requestPush()).resolves.toBeUndefined();
  });
  it("stores, reads and clears the resolution mark, tolerating storage failure", async () => {
    const disk: Record<string, unknown> = {};
    vi.mocked(chrome.storage.local.set).mockImplementation(async (items: any) => { Object.assign(disk, items); });
    vi.mocked(chrome.storage.local.get).mockImplementation(async (key: any) => ({ [key]: disk[key] }));
    vi.mocked(chrome.storage.local.remove).mockImplementation(async (key: any) => { delete disk[key]; });
    expect(await pendingResolutionPush()).toBeNull();
    await markResolutionPush();
    const mark = await pendingResolutionPush();
    expect(mark).toEqual(expect.any(Number));
    await clearResolutionPush(mark! + 1); // a newer resolution replaced it: stays
    expect(await pendingResolutionPush()).toBe(mark);
    await clearResolutionPush(mark!);
    expect(await pendingResolutionPush()).toBeNull();
    disk[RESOLUTION_PUSH_KEY] = "not a mark";
    expect(await pendingResolutionPush()).toBeNull();
    vi.mocked(chrome.storage.local.set).mockRejectedValueOnce(new Error("no ctx"));
    await expect(markResolutionPush()).resolves.toBeUndefined();
    vi.mocked(chrome.storage.local.get).mockRejectedValue(new Error("no ctx"));
    expect(await pendingResolutionPush()).toBeNull();
    vi.mocked(chrome.storage.local.get).mockResolvedValue({ [RESOLUTION_PUSH_KEY]: 5 } as never);
    vi.mocked(chrome.storage.local.remove).mockRejectedValueOnce(new Error("no ctx"));
    await expect(clearResolutionPush(5)).resolves.toBeUndefined();
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
