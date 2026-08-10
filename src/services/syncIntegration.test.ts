import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SavedSpace } from "~src/types";

// Integration test: fake OCC backend + production-shaped device loop:
// decideReconciliation3, merge3 on 409, syncStructuredSnapshot, local writeback
// + merge-base advance on confirmed push (mirrors background + FE-A1/B1/B4).

const be = { spaces: [] as SavedSpace[], revision: 0 };
const deviceRev = new Map<string, number | null>();
let active = "";
const copy = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

vi.mock("~src/store/useSavedSpacesStore", () => ({
  ensureDefaultData: vi.fn(),
  syncActiveSelection: vi.fn(),
}));
vi.mock("~src/store/useSyncConflict", () => ({
  useSyncConflict: { getState: () => ({ open: vi.fn(), close: vi.fn() }) },
}));

vi.mock("./api", () => ({
  pushSync: async (spaces: SavedSpace[], base: number | null) => {
    if (base !== be.revision) {
      return { status: "conflict", revision: be.revision, spaces: copy(be.spaces) };
    }
    be.spaces = copy(spaces);
    be.revision += 1;
    return { status: "ok", revision: be.revision };
  },
  fetchSyncRevision: async () => be.revision,
}));
vi.mock("./revision", () => ({
  getStoredRevision: async () => deviceRev.get(active) ?? null,
  setStoredRevision: async (r: number) => {
    deviceRev.set(active, r);
  },
}));

import { decideReconciliation3, resolveChoice, spacesSignature } from "./syncEngine";
import { merge3 } from "./spacesMerge3";
import { syncStructuredSnapshot } from "./structuredSync";
import type { StructuredSyncResult } from "./structuredSync";

const tab = (id: string) => ({ id, url: "u" + id, title: id, favicon: "", order: 0 });
function space(id: string, name: string, tabs: ReturnType<typeof tab>[]): SavedSpace {
  return {
    id,
    name,
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
function tabIds(spaces: SavedSpace[]): string[] {
  const ids: string[] = [];
  for (const s of spaces) {
    for (const p of s.projects) {
      for (const c of p.categories) {
        for (const g of c.groups) {
          for (const t of g.tabs) ids.push(t.id);
        }
      }
    }
  }
  return ids.sort();
}

/** Device mirrors production: per-device merge-base, merge3 on 409, writeback on land. */
class Device {
  local: SavedSpace[] = [];
  /** Last server-confirmed tree (null until GET-equals apply or successful push). */
  mergeBase: SavedSpace[] | null = null;

  constructor(public name: string) {}

  // Mirrors syncEngine.reconcile (3-way when base exists).
  reconcile(fresh = false, choice: "merge" | "server" | "local" = "merge") {
    const server = copy(be.spaces);
    deviceRev.set(this.name, be.revision);
    const d = decideReconciliation3(this.mergeBase, server, this.local, fresh);
    if (d.kind === "conflict") {
      this.local = resolveChoice(choice, server, this.local);
    } else if (d.kind === "item-conflict") {
      // Default field resolutions already applied in merge3's `spaces` snapshot.
      this.local = copy(d.spaces);
    } else {
      this.local = copy(d.spaces);
    }
    // FE-B1: only advance base when applied tree equals the GET server.
    if (spacesSignature(this.local) === spacesSignature(server)) {
      this.mergeBase = copy(this.local);
    }
  }

  // Mirrors background OCC push: merge3 + writeback + merge-base on land.
  async push(): Promise<StructuredSyncResult> {
    active = this.name;
    return syncStructuredSnapshot(
      copy(this.local),
      async () => copy(this.local),
      async (server, local) => {
        const { merged, conflicts } = merge3(
          this.mergeBase,
          server as SavedSpace[],
          local as SavedSpace[],
        );
        if (conflicts.length > 0) return null;
        return merged;
      },
      async (spaces) => {
        // FE-A1 / FE-B1: durable local + base match what landed on the server.
        this.local = copy(spaces as SavedSpace[]);
        this.mergeBase = copy(spaces as SavedSpace[]);
      },
    );
  }
}

beforeEach(() => {
  be.spaces = [];
  be.revision = 0;
  deviceRev.clear();
  active = "";
});

describe("sync integration — data integrity (production merge3 path)", () => {
  it("guest with tabs logs into an account with tabs → merge keeps both", async () => {
    be.spaces = [space("acc", "Account", [tab("x")])];
    be.revision = 1;

    const d = new Device("D");
    d.local = [space("guest", "Personal", [tab("y")])];
    d.reconcile(true, "merge");
    await d.push();

    expect(tabIds(be.spaces)).toEqual(["x", "y"]);
    expect(tabIds(d.local)).toEqual(["x", "y"]); // writeback
    expect(d.mergeBase && tabIds(d.mergeBase)).toEqual(["x", "y"]);
  });

  it("empty guest login does not wipe the account", async () => {
    be.spaces = [space("acc", "Account", [tab("x")])];
    be.revision = 1;

    const d = new Device("D");
    d.local = [space("def", "Personal", [])];
    d.reconcile(true);
    await d.push();

    expect(tabIds(be.spaces)).toEqual(["x"]);
  });

  it("two devices editing the SAME space concurrently → no tab lost", async () => {
    be.spaces = [space("S", "Work", [tab("base")])];
    be.revision = 1;

    const a = new Device("A");
    const b = new Device("B");
    a.reconcile();
    b.reconcile();
    expect(a.mergeBase && tabIds(a.mergeBase)).toEqual(["base"]);
    expect(b.mergeBase && tabIds(b.mergeBase)).toEqual(["base"]);

    a.local = [space("S", "Work", [tab("base"), tab("A")])];
    b.local = [space("S", "Work", [tab("base"), tab("B")])];

    await a.push();
    expect(tabIds(be.spaces)).toEqual(["A", "base"]);
    expect(tabIds(a.local)).toEqual(["A", "base"]);

    await b.push(); // 409 → merge3(base, server=A+base, local=B+base)
    expect(tabIds(be.spaces)).toEqual(["A", "B", "base"]);
    // FE-A1: B's local must match what landed — not stay at pre-merge base+B only.
    expect(tabIds(b.local)).toEqual(["A", "B", "base"]);
    expect(b.mergeBase && tabIds(b.mergeBase)).toEqual(["A", "B", "base"]);
  });

  it("three devices each add a tab → all present after syncing", async () => {
    be.spaces = [space("S", "Work", [tab("base")])];
    be.revision = 1;

    const ds = ["A", "B", "C"].map((n) => new Device(n));
    ds.forEach((d) => d.reconcile());
    ds[0].local = [space("S", "Work", [tab("base"), tab("A")])];
    ds[1].local = [space("S", "Work", [tab("base"), tab("B")])];
    ds[2].local = [space("S", "Work", [tab("base"), tab("C")])];

    for (const d of ds) await d.push();

    expect(tabIds(be.spaces)).toEqual(["A", "B", "C", "base"]);
    // Last pusher has full writeback; earlier devices may be stale until they pull —
    // but server holds the union (no lost update on OCC path).
  });

  it("repeated reconcile + push keeps data stable (no duplication)", async () => {
    be.spaces = [space("S", "Work", [tab("a")])];
    be.revision = 1;

    const a = new Device("A");
    for (let i = 0; i < 3; i++) {
      a.reconcile();
      await a.push();
    }

    expect(be.spaces).toHaveLength(1);
    expect(tabIds(be.spaces)).toEqual(["a"]);
  });

  it("a device with local-only spaces never loses them to a concurrent push", async () => {
    be.spaces = [space("shared", "Shared", [tab("s")])];
    be.revision = 1;

    const a = new Device("A");
    const b = new Device("B");
    a.reconcile();
    b.reconcile();
    a.local = [space("shared", "Shared", [tab("s"), tab("a")])];
    b.local = [
      space("shared", "Shared", [tab("s")]),
      space("bOnly", "B Only", [tab("bx")]),
    ];

    await a.push();
    await b.push();

    expect(tabIds(be.spaces)).toEqual(["a", "bx", "s"]);
    expect(be.spaces.map((s) => s.id).sort()).toEqual(["bOnly", "shared"]);
    expect(tabIds(b.local)).toEqual(["a", "bx", "s"]);
  });

  it("OCC writeback prevents next 3-way from treating peer tabs as local deletes", async () => {
    // Without writeback: B.local stays base+B after merge-push of A+B+base;
    // next push would merge with base=B's old mergeBase and risk dropping A.
    be.spaces = [space("S", "Work", [tab("base")])];
    be.revision = 1;

    const a = new Device("A");
    const b = new Device("B");
    a.reconcile();
    b.reconcile();
    a.local = [space("S", "Work", [tab("base"), tab("A")])];
    b.local = [space("S", "Work", [tab("base"), tab("B")])];

    await a.push();
    await b.push();
    // B already has full tree via writeback; a further push is a no-op land.
    const result = await b.push();
    expect(result).toBe("ok");
    expect(tabIds(be.spaces)).toEqual(["A", "B", "base"]);
    expect(tabIds(b.local)).toEqual(["A", "B", "base"]);
  });
});
