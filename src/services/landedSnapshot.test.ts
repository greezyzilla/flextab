import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SavedSpace } from "~src/types";
import { lightSpacesSig } from "~src/lib/yjsDoc";

/**
 * Pure helper mirroring background onStructuredPushLanded writeback decision:
 * only rewrite durable local state when the landed tree differs from disk.
 */
async function maybeWritebackLanded(
  landed: SavedSpace[],
  readDisk: () => Promise<SavedSpace[]>,
  writeDisk: (s: SavedSpace[]) => Promise<void>,
): Promise<boolean> {
  const disk = await readDisk();
  if (lightSpacesSig(disk) === lightSpacesSig(landed)) return false;
  await writeDisk(landed);
  return true;
}

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

describe("OCC landed writeback decision (FE-A1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not rewrite disk when landed equals current storage", async () => {
    const tree = [space("S", [tab("a"), tab("b")])];
    const write = vi.fn();
    const wrote = await maybeWritebackLanded(tree, async () => tree, write);
    expect(wrote).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });

  it("rewrites disk when OCC merge produced a different tree than storage", async () => {
    const disk = [space("S", [tab("local-only")])];
    const landed = [space("S", [tab("local-only"), tab("from-peer")])];
    const write = vi.fn(async () => {});
    const wrote = await maybeWritebackLanded(landed, async () => disk, write);
    expect(wrote).toBe(true);
    expect(write).toHaveBeenCalledWith(landed);
  });
});
