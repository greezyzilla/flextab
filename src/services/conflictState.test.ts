import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  saveOccConflictPayload,
  loadOccConflictPayload,
  clearConflictPending,
  isConflictPending,
  OCC_CONFLICT_PAYLOAD_KEY,
  CONFLICT_PENDING_KEY,
} from "./conflictState";
import { useSyncStore } from "~src/store/useSyncStore";
import type { SavedSpace } from "~src/types";

const tab = (id: string) => ({ id, url: "u" + id, title: id, favicon: "", order: 0 });
function space(id: string, tabs: ReturnType<typeof tab>[]): SavedSpace {
  return {
    id,
    name: id,
    order: 0,
    projects: [
      {
        id: id + "p",
        name: "P",
        order: 0,
        categories: [
          {
            id: id + "c",
            name: "C",
            order: 0,
            groups: [{ id: id + "g", name: "G", order: 0, tabs }],
          },
        ],
      },
    ],
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  (chrome.storage.local.get as any).mockResolvedValue({});
  (chrome.storage.local.set as any).mockResolvedValue(undefined);
  (chrome.storage.local.remove as any).mockResolvedValue(undefined);
  useSyncStore.getState().reset();
  await clearConflictPending();
  vi.clearAllMocks();
  (chrome.storage.local.get as any).mockResolvedValue({});
  (chrome.storage.local.set as any).mockResolvedValue(undefined);
  (chrome.storage.local.remove as any).mockResolvedValue(undefined);
});

describe("OCC conflict payload (FE-B3)", () => {
  it("saveOccConflictPayload stores base/server/local and sets conflict pending", async () => {
    const base = [space("S", [tab("base")])];
    // edit-edit on different tabs → may or may not conflict; force conflicts via same tab rename
    const serverEdit = [space("S", [{ ...tab("base"), title: "Server" }])];
    const localEdit = [space("S", [{ ...tab("base"), title: "Local" }])];

    const payload = await saveOccConflictPayload({
      base,
      server: serverEdit,
      local: localEdit,
    });

    expect(payload.conflicts.length).toBeGreaterThan(0);
    expect(useSyncStore.getState().conflictPending).toBe(true);
    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({ [CONFLICT_PENDING_KEY]: true }),
    );
    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({
        [OCC_CONFLICT_PAYLOAD_KEY]: expect.objectContaining({
          server: serverEdit,
          local: localEdit,
        }),
      }),
    );

    (chrome.storage.local.get as any).mockResolvedValue({
      [OCC_CONFLICT_PAYLOAD_KEY]: payload,
    });
    const loaded = await loadOccConflictPayload();
    expect(loaded?.conflicts.length).toBe(payload.conflicts.length);
    expect(loaded?.server).toEqual(serverEdit);
  });

  it("clearConflictPending removes flag and OCC payload", async () => {
    await saveOccConflictPayload({
      base: [space("S", [tab("t")])],
      server: [space("S", [{ ...tab("t"), title: "A" }])],
      local: [space("S", [{ ...tab("t"), title: "B" }])],
    });
    await clearConflictPending();
    expect(useSyncStore.getState().conflictPending).toBe(false);
    expect(chrome.storage.local.remove).toHaveBeenCalledWith([
      CONFLICT_PENDING_KEY,
      OCC_CONFLICT_PAYLOAD_KEY,
    ]);
  });

  it("isConflictPending reads storage (background-safe)", async () => {
    (chrome.storage.local.get as any).mockResolvedValue({ [CONFLICT_PENDING_KEY]: true });
    expect(await isConflictPending()).toBe(true);
    (chrome.storage.local.get as any).mockResolvedValue({});
    expect(await isConflictPending()).toBe(false);
  });
});
