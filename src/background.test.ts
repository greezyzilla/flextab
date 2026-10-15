import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { SavedSpace } from "./types";

vi.mock("~src/services/api", () => ({
  loadTokens: vi.fn(async () => ({ access_token: "token" })),
  getDeviceId: vi.fn(async () => "device"),
  pushSync: vi.fn(),
  fetchSyncRevision: vi.fn(async () => 1),
}));

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
};
const space = (id: string, name = id): SavedSpace => ({ id, name, order: 0, projects: [] });
let disk: Record<string, any>;
let listeners: Array<(changes: any, area: string) => void>;
let background: typeof import("./background");
let yjs: typeof import("./lib/yjsDoc");
let api: typeof import("./services/api");
let landed: typeof import("./services/landedSnapshot");

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
  listeners = [];
  disk = { flextab_sync_hydrated: true, flextab_sync_revision: 1 };
  vi.mocked(chrome.storage.onChanged.addListener).mockImplementation(fn => { listeners.push(fn); });
  vi.mocked(chrome.storage.local.get).mockImplementation(async (key: any) => ({ [key]: structuredClone(disk[key]) }));
  vi.mocked(chrome.storage.local.set).mockImplementation(async (items: any) => {
    const changes: Record<string, any> = {};
    for (const [key, value] of Object.entries(items)) {
      if (JSON.stringify(value) === JSON.stringify(disk[key])) continue;
      changes[key] = { oldValue: disk[key], newValue: structuredClone(value) };
      disk[key] = structuredClone(value);
    }
    if (Object.keys(changes).length) listeners.forEach(fn => fn(changes, "local"));
  });
  vi.mocked(chrome.storage.local.remove).mockImplementation(async (keys: any) => {
    const changes: Record<string, any> = {};
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      if (disk[key] === undefined) continue;
      changes[key] = { oldValue: disk[key] };
      delete disk[key];
    }
    if (Object.keys(changes).length) listeners.forEach(fn => fn(changes, "local"));
  });
  Object.assign(chrome.runtime, {
    onInstalled: { addListener: vi.fn() }, onStartup: { addListener: vi.fn() },
  });
  Object.assign(chrome, { alarms: { create: vi.fn(), onAlarm: { addListener: vi.fn() } } });
  yjs = await import("./lib/yjsDoc");
  api = await import("./services/api");
  landed = await import("./services/landedSnapshot");
  background = await import("./background");
});
afterEach(() => { vi.useRealTimers(); });

async function edit(spaces: SavedSpace[]) {
  await chrome.storage.local.set({ [yjs.PERSIST_KEY]: yjs.encodeSpacesAsStorage(spaces) });
}

async function until(predicate: () => boolean) {
  for (let i = 0; i < 100 && !predicate(); i++) await Promise.resolve();
  expect(predicate()).toBe(true);
}

describe("production background push", () => {
  it("keeps edits local after manual hydration when auto-sync is off, across every trigger", async () => {
    disk["flextab-settings"] = JSON.stringify({ state: { autoSync: false }, version: 2 });
    await edit([space("private")]);
    await vi.advanceTimersByTimeAsync(5000);
    await vi.mocked(chrome.runtime.onStartup.addListener).mock.calls[0][0]();
    const alarm = vi.mocked(chrome.alarms.onAlarm.addListener).mock.calls[0][0];
    alarm({ name: "flextab_push_retry" } as any);
    await background.pushStructuredData();
    expect(api.pushSync).not.toHaveBeenCalled();
    expect(disk.flextab_push_pending).toBe(true);
    expect(yjs.decodeSpacesFromStorage(disk[yjs.PERSIST_KEY])).toEqual([space("private")]);
  });

  it("pauses a queued debounce and retains the retry marker", async () => {
    await edit([space("local")]);
    await chrome.storage.local.set({ "flextab-settings": JSON.stringify({ state: { autoSync: false } }) });
    await vi.advanceTimersByTimeAsync(10000);
    expect(api.pushSync).not.toHaveBeenCalled();
    expect(disk.flextab_push_pending).toBe(true);
  });

  it("records an already accepted request but prevents the trailing upload after Off", async () => {
    const first = deferred<any>();
    vi.mocked(api.pushSync).mockReturnValueOnce(first.promise);
    await edit([space("a")]);
    const run = background.pushStructuredData();
    await until(() => vi.mocked(api.pushSync).mock.calls.length === 1);
    await chrome.storage.local.set({ "flextab-settings": JSON.stringify({ state: { autoSync: false } }) });
    await edit([space("later")]);
    first.resolve({ status: "ok", revision: 2 });
    await run;
    await vi.advanceTimersByTimeAsync(5000);
    expect(api.pushSync).toHaveBeenCalledTimes(1);
    expect(disk.flextab_push_pending).toBe(true);
    expect(yjs.decodeSpacesFromStorage(disk[yjs.PERSIST_KEY])).toEqual([space("later")]);
    expect(disk.flextab_merge_base).toEqual([space("a")]);
  });

  it("does not retry a 409 after automatic sync is turned off", async () => {
    const first = deferred<any>();
    disk.flextab_merge_base = [space("a")];
    vi.mocked(api.pushSync).mockReturnValueOnce(first.promise);
    await edit([space("a")]);
    const run = background.pushStructuredData();
    await until(() => vi.mocked(api.pushSync).mock.calls.length === 1);
    disk["flextab-settings"] = JSON.stringify({ state: { autoSync: false } });
    first.resolve({ status: "conflict", revision: 2, spaces: [space("a"), space("peer")] });
    await run;
    expect(api.pushSync).toHaveBeenCalledTimes(1);
    expect(disk.flextab_push_pending).toBe(true);
  });

  it("debounces and uploads a page envelope written by the live document", async () => {
    vi.mocked(api.pushSync).mockResolvedValue({ status: "ok", revision: 2 });
    const spaces = [space("page")];
    yjs.setSpaces(spaces);
    await yjs.persistState();
    expect(disk.flextab_push_pending).toBe(true);
    expect(api.pushSync).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5000);
    expect(api.pushSync).toHaveBeenCalledWith(spaces, 1, expect.any(Function));
    expect(disk.flextab_push_pending).toBeUndefined();
  });

  it("uploads a persisted snapshot envelope on worker startup without a new storage event", async () => {
    const spaces = [space("snapshot")];
    disk[yjs.PERSIST_KEY] = { version: 1, origin: "snapshot", data: yjs.encodeSpacesAsStorage(spaces) };
    vi.mocked(api.pushSync).mockResolvedValue({ status: "ok", revision: 2 });
    const startup = vi.mocked(chrome.runtime.onStartup.addListener).mock.calls[0][0];
    await startup();
    expect(api.pushSync).toHaveBeenCalledWith(spaces, 1, expect.any(Function));
  });

  it("retains pending work instead of uploading an invalid envelope as an empty tree", async () => {
    disk[yjs.PERSIST_KEY] = { version: 2, origin: "page", data: [0, 0] };
    disk.flextab_push_pending = true;
    await background.pushStructuredData();
    expect(api.pushSync).not.toHaveBeenCalled();
    expect(disk.flextab_push_pending).toBe(true);
  });

  it("holds response A, keeps edit B, and serializes overlapping triggers into a latest-state push", async () => {
    const first = deferred<any>();
    const second = deferred<any>();
    vi.mocked(api.pushSync).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const a = [space("a")];
    const b = [space("a", "B"), space("b")];
    await edit(a);
    const run = background.pushStructuredData();
    await until(() => vi.mocked(api.pushSync).mock.calls.length === 1);
    await edit(b);
    const same = background.pushStructuredData(); // alarm/startup during the HTTP flight
    expect(same).toBe(run);
    expect(api.pushSync).toHaveBeenCalledTimes(1);
    first.resolve({ status: "ok", revision: 2 });
    await until(() => vi.mocked(api.pushSync).mock.calls.length === 2);
    expect(yjs.decodeSpacesFromStorage(disk[yjs.PERSIST_KEY])).toEqual(b);
    expect(disk.flextab_merge_base).toEqual(a);
    expect(disk.flextab_push_pending).toBe(true);
    expect(api.pushSync).toHaveBeenNthCalledWith(2, b, 2, expect.any(Function));
    second.resolve({ status: "ok", revision: 3 });
    await run;
    expect(disk.flextab_merge_base).toEqual(b);
    expect(disk.flextab_push_pending).toBeUndefined();
    await vi.advanceTimersByTimeAsync(5000);
    expect(api.pushSync).toHaveBeenCalledTimes(2);
  });

  it("retains pending edits after a trailing push fails, then retries current storage", async () => {
    const first = deferred<any>();
    vi.mocked(api.pushSync).mockReturnValueOnce(first.promise).mockResolvedValueOnce({ status: "error" });
    await edit([space("a")]);
    const run = background.pushStructuredData();
    await until(() => vi.mocked(api.pushSync).mock.calls.length === 1);
    const b = [space("b")];
    await edit(b);
    first.resolve({ status: "ok", revision: 2 });
    await run;
    expect(yjs.decodeSpacesFromStorage(disk[yjs.PERSIST_KEY])).toEqual(b);
    expect(disk.flextab_push_pending).toBe(true);
    vi.mocked(api.pushSync).mockResolvedValueOnce({ status: "ok", revision: 3 });
    await background.pushStructuredData();
    expect(api.pushSync).toHaveBeenLastCalledWith(b, 2, expect.any(Function));
    expect(disk.flextab_push_pending).toBeUndefined();
  });

  it("persists an OCC receipt and blocks stale disk uploads until the page rebases it", async () => {
    const a = [space("a")];
    const peer = [...a, space("peer")];
    disk.flextab_merge_base = a;
    const retry = deferred<any>();
    vi.mocked(api.pushSync)
      .mockResolvedValueOnce({ status: "conflict", revision: 2, spaces: peer })
      .mockReturnValueOnce(retry.promise);
    await edit(a);
    const run = background.pushStructuredData();
    await until(() => vi.mocked(api.pushSync).mock.calls.length === 2);
    const b = [space("a", "edited later"), space("new")];
    await edit(b);
    retry.resolve({ status: "ok", revision: 3 });
    await run;
    expect(yjs.decodeSpacesFromStorage(disk[yjs.PERSIST_KEY])).toEqual(b);
    expect(disk[landed.LANDED_SNAPSHOT_KEY].local).toEqual(a);
    expect(disk[landed.LANDED_SNAPSHOT_KEY].landed.map((s: SavedSpace) => s.id)).toEqual(["a", "peer"]);
    expect(disk.flextab_merge_base).toEqual(a);
    await background.pushStructuredData();
    expect(api.pushSync).toHaveBeenCalledTimes(2);
    vi.mocked(api.pushSync).mockResolvedValue({ status: "ok", revision: 4 });
    yjs.setSpaces(b);
    await landed.applyPendingLandedSnapshot();
    await until(() => vi.mocked(api.pushSync).mock.calls.length === 3);
    await background.pushStructuredData();
    expect(yjs.getSpaces().map(s => [s.id, s.name])).toEqual([
      ["a", "edited later"], ["peer", "peer"], ["new", "new"],
    ]);
    expect(disk[landed.LANDED_SNAPSHOT_KEY]).toBeUndefined();
    expect(api.pushSync).toHaveBeenNthCalledWith(3, yjs.getSpaces(), 3, expect.any(Function));
  });

  it("keeps a durable retry marker when reading the workspace fails", async () => {
    await edit([space("a")]);
    const read = vi.mocked(chrome.storage.local.get).getMockImplementation()!;
    vi.mocked(chrome.storage.local.get).mockImplementation(async (key: any) => {
      if (key === yjs.PERSIST_KEY) throw new Error("read failed");
      return (read as any)(key);
    });
    await background.pushStructuredData();
    expect(api.pushSync).not.toHaveBeenCalled();
    expect(disk.flextab_push_pending).toBe(true);
  });

  it("does not advance the accepted revision when OCC receipt persistence fails", async () => {
    const a = [space("a")];
    disk.flextab_merge_base = a;
    const retry = deferred<any>();
    vi.mocked(api.pushSync)
      .mockResolvedValueOnce({ status: "conflict", revision: 2, spaces: [...a, space("peer")] })
      .mockReturnValueOnce(retry.promise);
    await edit(a);
    const run = background.pushStructuredData();
    await until(() => vi.mocked(api.pushSync).mock.calls.length === 2);
    const set = vi.mocked(chrome.storage.local.set).getMockImplementation()!;
    vi.mocked(chrome.storage.local.set).mockImplementation(async (items: any) => {
      if (items[landed.LANDED_SNAPSHOT_KEY]) throw new Error("disk full");
      return (set as any)(items);
    });
    retry.resolve({ status: "ok", revision: 3 });
    await run;
    const { getStoredRevision } = await import("./services/revision");
    expect(await getStoredRevision()).toBe(1);
    expect(disk.flextab_push_pending).toBe(true);
    expect(yjs.decodeSpacesFromStorage(disk[yjs.PERSIST_KEY])).toEqual(a);
  });
});
