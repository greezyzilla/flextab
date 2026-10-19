import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import type { SavedSpace } from "../types";

let y: typeof import("./yjsDoc");
let disk: Record<string, any>;
let listeners: Array<(changes: any, area: string) => void>;
let events: Record<string, any>[];
const space = (name: string): SavedSpace => ({ id: "space", name, order: 0, projects: [] });
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  disk = {};
  listeners = [];
  events = [];
  vi.mocked(chrome.storage.onChanged.addListener).mockImplementation(fn => { listeners.push(fn); });
  vi.mocked(chrome.storage.local.get).mockImplementation(async (keys: any) =>
    Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, structuredClone(disk[key])])));
  vi.mocked(chrome.storage.local.set).mockImplementation(async (items: any) => {
    const changes: Record<string, any> = {};
    for (const [key, value] of Object.entries(items)) {
      if (JSON.stringify(disk[key]) === JSON.stringify(value)) continue;
      changes[key] = { oldValue: disk[key], newValue: structuredClone(value) };
      disk[key] = structuredClone(value);
    }
    if (Object.keys(changes).length) {
      events.push(changes);
      listeners.forEach(fn => fn(changes, "local"));
    }
  });
  y = await import("./yjsDoc");
  y.installExternalPersistBridge();
});

async function legacySnapshot(name: string) {
  await chrome.storage.local.set({
    [y.PERSIST_KEY]: y.encodeSpacesAsStorage([space(name)]),
    [y.PERSIST_ORIGIN_KEY]: "snapshot",
  });
  await flush();
}

describe("persisted workspace origin", () => {
  it("replaces two consecutive fresh-doc snapshots without duplicating spaces", async () => {
    await y.persistSpacesSnapshot([space("A")]);
    await y.persistSpacesSnapshot([space("B")]);
    expect(y.getSpaces()).toEqual([space("B")]);
    expect(events).toHaveLength(2);
    expect(events[1][y.PERSIST_KEY].newValue.origin).toBe("snapshot");
    expect(disk[y.PERSIST_ORIGIN_KEY]).toBeUndefined();
  });

  it("handles page → snapshot → snapshot → page and merges concurrent peer edits", async () => {
    y.setSpaces([space("page")]);
    await y.persistState();
    await y.persistSpacesSnapshot([space("A")]);
    await y.persistSpacesSnapshot([space("B")]);
    const peer = new Y.Doc();
    Y.applyUpdate(peer, y.encodeState());
    peer.getArray<Y.Map<unknown>>("spaces").get(0).set("name", "peer edit");
    y.spacesArray.get(0).set("color", "blue");
    await chrome.storage.local.set({ [y.PERSIST_KEY]: {
      version: 1, origin: "page", data: Array.from(Y.encodeStateAsUpdate(peer)),
    } });
    await flush();
    expect(y.getSpaces()).toEqual([{ ...space("peer edit"), color: "blue" }]);
    expect(y.decodeSpacesFromStorage(disk[y.PERSIST_KEY])).toEqual(y.getSpaces());
    const writes = events.length;
    // A duplicate page event must not cause an endless republish loop.
    listeners.forEach(fn => fn({ [y.PERSIST_KEY]: { newValue: disk[y.PERSIST_KEY] } }, "local"));
    await flush();
    expect(events).toHaveLength(writes);
    peer.destroy();
  });

  it("loads an envelope after restart and preserves non-space Yjs receipt metadata", async () => {
    y.setSpaces([space("saved")]);
    y.doc.getMap("sync").set("landedReceipt", "receipt-id");
    await y.persistState();
    vi.resetModules();
    const restarted = await import("./yjsDoc");
    expect(await restarted.loadPersistedState()).toBe(true);
    expect(restarted.getSpaces()).toEqual([space("saved")]);
    expect(restarted.doc.getMap("sync").get("landedReceipt")).toBe("receipt-id");
  });

  it("hydrates a legacy array and migrates on the next page write", async () => {
    disk[y.PERSIST_KEY] = y.encodeSpacesAsStorage([space("legacy")]);
    expect(await y.loadPersistedState()).toBe(true);
    await y.persistState();
    expect(disk[y.PERSIST_KEY]).toMatchObject({ version: 1, origin: "page" });
    expect(y.getSpaces()).toEqual([space("legacy")]);
  });

  it("reads unchanged legacy origin instead of guessing page from an omitted delta", async () => {
    await legacySnapshot("A");
    await legacySnapshot("B");
    expect(events[1][y.PERSIST_ORIGIN_KEY]).toBeUndefined();
    expect(y.getSpaces()).toEqual([space("B")]);
  });

  it("discards delayed legacy lookups when a newer envelope arrives", async () => {
    let resolve!: (value: any) => void;
    vi.mocked(chrome.storage.local.get).mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const old = y.encodeSpacesAsStorage([space("old")]);
    await chrome.storage.local.set({ [y.PERSIST_KEY]: old, [y.PERSIST_ORIGIN_KEY]: "snapshot" });
    await y.persistSpacesSnapshot([space("new")]);
    resolve({ [y.PERSIST_KEY]: old, [y.PERSIST_ORIGIN_KEY]: "snapshot" });
    await flush();
    expect(y.getSpaces()).toEqual([space("new")]);
  });

  it("discards a legacy lookup whose storage value no longer matches its event", async () => {
    vi.mocked(chrome.storage.local.get).mockImplementationOnce(async () => ({
      [y.PERSIST_KEY]: y.encodeSpacesAsStorage([space("later")]), [y.PERSIST_ORIGIN_KEY]: "page",
    }));
    await legacySnapshot("old");
    expect(y.getSpaces()).toEqual([]);
  });

  it("does not merge a legacy snapshot when the origin read fails", async () => {
    y.setSpaces([space("keep")]);
    vi.mocked(chrome.storage.local.get).mockRejectedValueOnce(new Error("storage unavailable"));
    await legacySnapshot("unsafe");
    expect(y.getSpaces()).toEqual([space("keep")]);
  });

  it.each([
    { version: 2, origin: "snapshot", data: [0, 0] },
    { version: 1, data: [0, 0] },
    { version: 1, origin: "unknown", data: [0, 0] },
    { version: 1, origin: "snapshot", data: [256] },
    { version: 1, origin: "snapshot", data: [] },
  ])("ignores malformed envelopes without changing the live workspace: %j", async value => {
    y.setSpaces([space("keep")]);
    await chrome.storage.local.set({ [y.PERSIST_KEY]: value });
    expect(y.getSpaces()).toEqual([space("keep")]);
    expect(() => y.decodeSpacesFromStorage(value)).toThrow("Invalid persisted workspace format");
  });
});
