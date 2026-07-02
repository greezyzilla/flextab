import { describe, it, expect } from "vitest";
import { merge3 } from "./spacesMerge3";
import type { SavedSpace, SavedGroup } from "~src/types";

// --- builders ---
const tab = (id: string, title: string, url = `https://${id}`) => ({ id, title, url, favicon: "", order: 0 });
const grp = (id: string, name: string, tabs: ReturnType<typeof tab>[] = []): SavedGroup => ({ id, name, tabs, order: 0 });
const cat = (id: string, name: string, groups: SavedGroup[] = []) => ({ id, name, groups, order: 0 });
const prj = (id: string, name: string, categories: ReturnType<typeof cat>[] = []) => ({ id, name, categories, order: 0 });
const spc = (id: string, name: string, projects: ReturnType<typeof prj>[] = []): SavedSpace => ({ id, name, projects, order: 0 });

// wrap a set of groups in a standard space>project>category so we can test at the group level
const wrap = (groups: SavedGroup[]) => [spc("s1", "S", [prj("p1", "P", [cat("c1", "C", groups)])])];
const groupsOf = (spaces: SavedSpace[]) => spaces[0]?.projects[0]?.categories[0]?.groups ?? [];
const ids = (arr: { id: string }[]) => arr.map((x) => x.id).sort();

describe("merge3 — auto-merge (no conflict)", () => {
  it("add on server only → applied", () => {
    const base = wrap([grp("a", "A")]);
    const r = merge3(base, wrap([grp("a", "A"), grp("b", "B")]), wrap([grp("a", "A")]));
    expect(ids(groupsOf(r.merged))).toEqual(["a", "b"]);
    expect(r.conflicts).toHaveLength(0);
  });

  it("add on local only → applied", () => {
    const base = wrap([grp("a", "A")]);
    const r = merge3(base, wrap([grp("a", "A")]), wrap([grp("a", "A"), grp("b", "B")]));
    expect(ids(groupsOf(r.merged))).toEqual(["a", "b"]);
    expect(r.conflicts).toHaveLength(0);
  });

  it("add different items both sides → both kept (union)", () => {
    const base = wrap([grp("a", "A")]);
    const r = merge3(base, wrap([grp("a", "A"), grp("b", "B")]), wrap([grp("a", "A"), grp("c", "C")]));
    expect(ids(groupsOf(r.merged))).toEqual(["a", "b", "c"]);
    expect(r.conflicts).toHaveLength(0);
  });

  it("edit on one side only → applied", () => {
    const base = wrap([grp("a", "A")]);
    const r = merge3(base, wrap([grp("a", "Renamed")]), wrap([grp("a", "A")]));
    expect(groupsOf(r.merged)[0].name).toBe("Renamed");
    expect(r.conflicts).toHaveLength(0);
  });

  it("no change on either side → identity", () => {
    const base = wrap([grp("a", "A", [tab("t1", "T")])]);
    const r = merge3(base, wrap([grp("a", "A", [tab("t1", "T")])]), wrap([grp("a", "A", [tab("t1", "T")])]));
    expect(r.conflicts).toHaveLength(0);
    expect(groupsOf(r.merged)[0].name).toBe("A");
  });
});

describe("merge3 — deletion correctness (no resurrect)", () => {
  it("delete on local, server unchanged → stays deleted", () => {
    const base = wrap([grp("a", "A"), grp("b", "B")]);
    const r = merge3(base, wrap([grp("a", "A"), grp("b", "B")]), wrap([grp("a", "A")]));
    expect(ids(groupsOf(r.merged))).toEqual(["a"]); // b NOT resurrected
    expect(r.conflicts).toHaveLength(0);
  });

  it("delete on server, local unchanged → stays deleted", () => {
    const base = wrap([grp("a", "A"), grp("b", "B")]);
    const r = merge3(base, wrap([grp("a", "A")]), wrap([grp("a", "A"), grp("b", "B")]));
    expect(ids(groupsOf(r.merged))).toEqual(["a"]);
    expect(r.conflicts).toHaveLength(0);
  });

  it("delete on both → gone, no conflict", () => {
    const base = wrap([grp("a", "A"), grp("b", "B")]);
    const r = merge3(base, wrap([grp("a", "A")]), wrap([grp("a", "A")]));
    expect(ids(groupsOf(r.merged))).toEqual(["a"]);
    expect(r.conflicts).toHaveLength(0);
  });
});

describe("merge3 — true conflicts", () => {
  it("edit-edit same field, different values → conflict (default keep local)", () => {
    const base = wrap([grp("a", "A")]);
    const r = merge3(base, wrap([grp("a", "Server")]), wrap([grp("a", "Local")]));
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0]).toMatchObject({ kind: "field", field: "name", id: "a", server: "Server", local: "Local" });
    expect(groupsOf(r.merged)[0].name).toBe("Local"); // default
  });

  it("delete on one side, edit on the other → conflict (default keep the edit)", () => {
    const base = wrap([grp("a", "A"), grp("b", "B")]);
    // server deleted b; local edited b
    const r = merge3(base, wrap([grp("a", "A")]), wrap([grp("a", "A"), grp("b", "B edited")]));
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0]).toMatchObject({ kind: "delete-edit", deletedOn: "server", id: "b" });
    expect(ids(groupsOf(r.merged))).toEqual(["a", "b"]); // kept the edit
  });
});

describe("merge3 — keep-both", () => {
  it("concurrent create, same name, different id → both kept (no conflict)", () => {
    const r = merge3([], [spc("x", "Work")], [spc("y", "Work")]);
    expect(ids(r.merged)).toEqual(["x", "y"]);
    expect(r.conflicts).toHaveLength(0);
  });
});

describe("merge3 — structure / edges", () => {
  it("detects a conflict nested deep (tab title)", () => {
    const base = wrap([grp("a", "A", [tab("t1", "Title")])]);
    const r = merge3(base, wrap([grp("a", "A", [tab("t1", "Server")])]), wrap([grp("a", "A", [tab("t1", "Local")])]));
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0]).toMatchObject({ kind: "field", field: "title", id: "t1" });
    expect(r.conflicts[0].path).toContain("A"); // breadcrumb includes the group
  });

  it("reindexes order after merge", () => {
    const base = wrap([grp("a", "A")]);
    const r = merge3(base, wrap([grp("a", "A"), grp("b", "B")]), wrap([grp("a", "A"), grp("c", "C")]));
    const orders = groupsOf(r.merged).map((g) => g.order);
    expect(orders).toEqual([0, 1, 2]);
  });

  it("null base → lossless union, no deletes/conflicts", () => {
    const r = merge3(null, wrap([grp("a", "A"), grp("b", "B")]), wrap([grp("a", "A"), grp("c", "C")]));
    expect(ids(groupsOf(r.merged))).toEqual(["a", "b", "c"]);
    expect(r.conflicts).toHaveLength(0);
  });

  it("base equals one side → applies the other side's changes", () => {
    const base = wrap([grp("a", "A")]);
    // server == base; local added b + renamed a
    const r = merge3(base, wrap([grp("a", "A")]), wrap([grp("a", "A2"), grp("b", "B")]));
    expect(ids(groupsOf(r.merged))).toEqual(["a", "b"]);
    expect(groupsOf(r.merged).find((g) => g.id === "a")!.name).toBe("A2");
    expect(r.conflicts).toHaveLength(0);
  });
});

describe("merge3 — resolutions (per-item overrides)", () => {
  it("field conflict: override to server keeps the server value", () => {
    const base = wrap([grp("a", "A")]);
    const server = wrap([grp("a", "Server")]);
    const local = wrap([grp("a", "Local")]);
    const key = merge3(base, server, local).conflicts[0].key;
    const r = merge3(base, server, local, { [key]: "server" });
    expect(groupsOf(r.merged)[0].name).toBe("Server");
  });

  it("field conflict: override to local keeps the local value (explicit default)", () => {
    const base = wrap([grp("a", "A")]);
    const server = wrap([grp("a", "Server")]);
    const local = wrap([grp("a", "Local")]);
    const key = merge3(base, server, local).conflicts[0].key;
    const r = merge3(base, server, local, { [key]: "local" });
    expect(groupsOf(r.merged)[0].name).toBe("Local");
  });

  it("delete-edit (server deleted): override to server honors the delete (drops it)", () => {
    const base = wrap([grp("a", "A"), grp("b", "B")]);
    const server = wrap([grp("a", "A")]); // deleted b
    const local = wrap([grp("a", "A"), grp("b", "B edited")]); // edited b
    const key = merge3(base, server, local).conflicts[0].key;
    const r = merge3(base, server, local, { [key]: "server" });
    expect(ids(groupsOf(r.merged))).toEqual(["a"]); // delete honored
  });

  it("delete-edit (local deleted): override to local honors the delete (drops it)", () => {
    const base = wrap([grp("a", "A"), grp("b", "B")]);
    const server = wrap([grp("a", "A"), grp("b", "B edited")]); // edited b
    const local = wrap([grp("a", "A")]); // deleted b
    const key = merge3(base, server, local).conflicts[0].key;
    const r = merge3(base, server, local, { [key]: "local" });
    expect(ids(groupsOf(r.merged))).toEqual(["a"]); // delete honored
  });

  it("conflict.key is stable across runs", () => {
    const base = wrap([grp("a", "A")]);
    const a = merge3(base, wrap([grp("a", "S")]), wrap([grp("a", "L")])).conflicts[0].key;
    const b = merge3(base, wrap([grp("a", "S")]), wrap([grp("a", "L")])).conflicts[0].key;
    expect(a).toBe(b);
  });
});
