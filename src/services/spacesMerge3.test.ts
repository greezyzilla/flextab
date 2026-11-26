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

  it("delete on local + server's surviving copy differs from base only by falsy optional keys → still respects the delete (no false conflict)", () => {
    // Readers may omit empty optionals or include them as "". Same content must
    // not look like an edit and revive a real delete.
    const base = [spc("s1", "S1"), spc("s2", "S2")]; // omits optional keys
    const s2ServerShape = { ...spc("s2", "S2"), icon: "", color: "", abbreviation: "" };
    const r = merge3(base, [spc("s1", "S1"), s2ServerShape], [spc("s1", "S1")]); // local deleted s2
    expect(ids(r.merged)).toEqual(["s1"]); // s2 stays deleted
    expect(r.conflicts).toHaveLength(0); // not a false delete-edit conflict
  });
});

describe("merge3 — scalar empty-as-absent (FE-B2)", () => {
  it("icon missing vs icon \"\" is not a field conflict when both 'changed' from base", () => {
    // base has no icon; server shape has icon:""; local also has no icon — no real edit.
    const base = [spc("s1", "Work")];
    const server = [{ ...spc("s1", "Work"), icon: "" }];
    const local = [spc("s1", "Work")];
    const r = merge3(base, server, local);
    expect(r.conflicts.filter((c) => c.field === "icon")).toHaveLength(0);
  });

  it("real icon edit-edit still conflicts", () => {
    const base = [{ ...spc("s1", "Work"), icon: "a" }];
    const server = [{ ...spc("s1", "Work"), icon: "server" }];
    const local = [{ ...spc("s1", "Work"), icon: "local" }];
    const r = merge3(base, server, local);
    expect(r.conflicts.some((c) => c.field === "icon")).toBe(true);
    expect(r.merged[0].icon).toBe("local"); // default keep local
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

describe("merge3 — group colour", () => {
  const coloured = (id: string, name: string, color?: SavedGroup["color"]): SavedGroup => ({ ...grp(id, name), ...(color ? { color } : {}) });

  it("a colour set on this device survives a server change elsewhere", () => {
    const base = wrap([coloured("a", "A")]);
    const r = merge3(base, wrap([coloured("a", "Renamed")]), wrap([coloured("a", "A", "red")]));
    expect(r.conflicts).toEqual([]);
    expect(groupsOf(r.merged)[0]).toMatchObject({ name: "Renamed", color: "red" });
  });

  it("a colour changed or cleared on the server is applied", () => {
    const base = wrap([coloured("a", "A", "blue"), coloured("b", "B", "green")]);
    const r = merge3(base, wrap([coloured("a", "A", "red"), coloured("b", "B")]), base);
    expect(r.conflicts).toEqual([]);
    expect(groupsOf(r.merged).map(g => g.color || undefined)).toEqual(["red", undefined]);
  });

  it("both sides recolouring the same group differently is a Color conflict", () => {
    const base = wrap([coloured("a", "A", "blue")]);
    const r = merge3(base, wrap([coloured("a", "A", "red")]), wrap([coloured("a", "A", "green")]));
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0]).toMatchObject({ kind: "field", field: "color", base: "blue", server: "red", local: "green" });
    expect(groupsOf(r.merged)[0].color).toBe("green"); // default: this device
    const pick = merge3(base, wrap([coloured("a", "A", "red")]), wrap([coloured("a", "A", "green")]), { [r.conflicts[0].key]: "server" });
    expect(groupsOf(pick.merged)[0].color).toBe("red");
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

// --- moves ---
// A move is "gone from one parent, present under another". Merged per parent it
// used to come out twice, and the server rejects a tree with a duplicate id.
describe("merge3 — moves across parents", () => {
  const t1 = tab("t1", "One"), t2 = tab("t2", "Two");
  const project = (tabs = [t1], name = "Test") => prj("P", name, [cat("Pc", "C", [grp("Pg", "G", tabs)])]);
  const tree = (where: "A" | "B" | "C" | null, p = project()) => [
    spc("A", "Hobby", where === "A" ? [p] : []),
    spc("B", "Personal", where === "B" ? [p] : []),
    spc("C", "Work", where === "C" ? [p] : []),
  ];
  const allIds = (spaces: SavedSpace[]) => {
    const out: string[] = [];
    const walk = (n: any) => { out.push(n.id); for (const k of ["projects", "categories", "groups", "tabs"]) (n[k] ?? []).forEach(walk); };
    spaces.forEach(walk);
    return out;
  };
  const spaceOf = (spaces: SavedSpace[], id = "P") => spaces.filter((s) => s.projects.some((p) => p.id === id)).map((s) => s.id);
  const tabsOf = (spaces: SavedSpace[]) => spaces.flatMap((s) => s.projects.filter((p) => p.id === "P")).flatMap((p) => p.categories[0].groups[0].tabs.map((t) => t.id));
  const unique = (spaces: SavedSpace[]) => expect(new Set(allIds(spaces)).size).toBe(allIds(spaces).length);

  it("moved on this device, untouched on the account → moves, no conflict", () => {
    const r = merge3(tree("A"), tree("A"), tree("B"));
    expect(spaceOf(r.merged)).toEqual(["B"]);
    expect(r.conflicts).toHaveLength(0);
  });

  it("moved on the account, untouched here → moves, no conflict", () => {
    const r = merge3(tree("A"), tree("C"), tree("A"));
    expect(spaceOf(r.merged)).toEqual(["C"]);
    expect(r.conflicts).toHaveLength(0);
  });

  it("moved here while the account added a tab inside → one copy, at the new place, with both tabs", () => {
    const r = merge3(tree("A"), tree("A", project([t1, t2])), tree("B"));
    expect(spaceOf(r.merged)).toEqual(["B"]);
    expect(tabsOf(r.merged)).toEqual(["t1", "t2"]);
    expect(r.conflicts).toHaveLength(0);
    unique(r.merged);
  });

  it("moved here while the account renamed it → one copy, moved and renamed", () => {
    const r = merge3(tree("A"), tree("A", project([t1], "Renamed")), tree("B"));
    expect(spaceOf(r.merged)).toEqual(["B"]);
    expect(r.merged.find((s) => s.id === "B")!.projects[0].name).toBe("Renamed");
    unique(r.merged);
  });

  it("moved to the same place on both sides → no conflict", () => {
    const r = merge3(tree("A"), tree("B"), tree("B"));
    expect(spaceOf(r.merged)).toEqual(["B"]);
    expect(r.conflicts).toHaveLength(0);
  });

  it("moved to different places on both sides → a location conflict, this device's place by default", () => {
    const r = merge3(tree("A"), tree("C"), tree("B"));
    expect(spaceOf(r.merged)).toEqual(["B"]);
    expect(r.conflicts).toEqual([expect.objectContaining({ kind: "field", field: "location", id: "P", base: "Hobby", server: "Work", local: "Personal" })]);
    unique(r.merged);
    const chosen = merge3(tree("A"), tree("C"), tree("B"), { [r.conflicts[0].key]: "server" });
    expect(spaceOf(chosen.merged)).toEqual(["C"]);
    unique(chosen.merged);
  });

  it("moved here, deleted on the account → delete-edit, kept at the new place by default", () => {
    const r = merge3(tree("A"), tree(null), tree("B"));
    expect(r.conflicts).toEqual([expect.objectContaining({ kind: "delete-edit", deletedOn: "server", id: "P", movedTo: "Personal" })]);
    expect(spaceOf(r.merged)).toEqual(["B"]);
    const honored = merge3(tree("A"), tree(null), tree("B"), { [r.conflicts[0].key]: "server" });
    expect(spaceOf(honored.merged)).toEqual([]);
  });

  it("moved on the account, deleted here → delete-edit, kept at the account's place by default", () => {
    const r = merge3(tree("A"), tree("C"), tree(null));
    expect(r.conflicts).toEqual([expect.objectContaining({ kind: "delete-edit", deletedOn: "local", movedTo: "Work" })]);
    expect(spaceOf(r.merged)).toEqual(["C"]);
  });

  it("moved into a space created here, edited on the account → lands in the new space with the edit", () => {
    const local = [...tree(null), spc("D", "New", [project()])];
    const r = merge3(tree("A"), tree("A", project([t1, t2])), local);
    expect(spaceOf(r.merged)).toEqual(["D"]);
    expect(tabsOf(r.merged)).toEqual(["t1", "t2"]);
    expect(r.merged.find((s) => s.id === "D")!.name).toBe("New");
    expect(r.conflicts).toHaveLength(0);
    unique(r.merged);
  });

  it("moved into a space the account deleted → the space is a delete-edit conflict, no duplicate", () => {
    const server = [spc("A", "Hobby", [project([t1, t2])]), spc("C", "Work")]; // B deleted, tab added in P
    const r = merge3(tree("A"), server, tree("B"));
    expect(r.conflicts).toEqual([expect.objectContaining({ kind: "delete-edit", deletedOn: "server", id: "B", movedIn: "Test" })]);
    expect(spaceOf(r.merged)).toEqual(["B"]); // kept by default, with the moved project
    unique(r.merged);
    const honored = merge3(tree("A"), server, tree("B"), { [r.conflicts[0].key]: "server" });
    expect(honored.merged.map((sp) => sp.id)).toEqual(["A", "C"]);
    unique(honored.merged);
  });

  it("a category moved to a project in another space while its group was renamed → one copy", () => {
    const base = [spc("A", "Hobby", [prj("p1", "Music", [cat("c1", "Songs", [grp("g1", "Old")])])]), spc("B", "Personal", [prj("p2", "Fun")])];
    const server = [spc("A", "Hobby", [prj("p1", "Music", [cat("c1", "Songs", [grp("g1", "New")])])]), spc("B", "Personal", [prj("p2", "Fun")])];
    const local = [spc("A", "Hobby", [prj("p1", "Music")]), spc("B", "Personal", [prj("p2", "Fun", [cat("c1", "Songs", [grp("g1", "Old")])])])];
    const r = merge3(base, server, local);
    expect(r.merged[1].projects[0].categories.map((c) => c.id)).toEqual(["c1"]);
    expect(r.merged[1].projects[0].categories[0].groups[0].name).toBe("New");
    expect(r.merged[0].projects[0].categories).toEqual([]);
    unique(r.merged);
  });

  it("a tab moved to another group while retitled on the account → one tab, moved and retitled", () => {
    const base = wrap([grp("a", "A", [tab("x", "Old")]), grp("b", "B")]);
    const server = wrap([grp("a", "A", [tab("x", "New")]), grp("b", "B")]);
    const local = wrap([grp("a", "A"), grp("b", "B", [tab("x", "Old")])]);
    const r = merge3(base, server, local);
    expect(groupsOf(r.merged).map((g) => g.tabs.map((t) => `${t.id}:${t.title}`))).toEqual([[], ["x:New"]]);
    expect(r.conflicts).toHaveLength(0);
  });

  it("moved on the account into a space deleted here → the space is a delete-edit conflict, kept by default", () => {
    const local = [spc("A", "Hobby", [project()]), spc("C", "Work")]; // B deleted here
    const r = merge3(tree("A"), tree("B"), local);
    expect(r.conflicts).toEqual([expect.objectContaining({ kind: "delete-edit", deletedOn: "local", id: "B", movedIn: "Test" })]);
    expect(spaceOf(r.merged)).toEqual(["B"]);
    unique(r.merged);
  });

  it("a category moved into a project created here, in an existing space, while the account edited it", () => {
    const base = [spc("A", "Hobby", [prj("p1", "Music", [cat("c1", "Songs", [grp("g1", "G", [tab("x", "X")])])])])];
    const server = [spc("A", "Hobby", [prj("p1", "Music", [cat("c1", "Songs", [grp("g1", "G", [tab("x", "X"), tab("y", "Y")])])])])];
    const local = [spc("A", "Hobby", [prj("p1", "Music"), prj("p9", "New", [cat("c1", "Songs", [grp("g1", "G", [tab("x", "X")])])])])];
    const r = merge3(base, server, local);
    const [music, fresh] = r.merged[0].projects;
    expect(music.categories).toEqual([]);
    expect(fresh.name).toBe("New");
    expect(fresh.categories[0].groups[0].tabs.map((t) => t.id)).toEqual(["x", "y"]);
    expect(r.conflicts).toHaveLength(0);
    unique(r.merged);
  });

  it("moves a project and a group into it in one merge → both land, the group inside the moved project", () => {
    // Base: project P in space A, group X in project Q (space A). This device moves P to space B
    // and X into P's category. The group's move target only exists at its final place once the
    // project has moved, so parent moves must apply first.
    const q = (groups: SavedGroup[]) => prj("Q", "Other", [cat("Qc", "QC", groups)]);
    const p = (groups: SavedGroup[]) => prj("P", "Test", [cat("Pc", "C", [grp("Pg", "G", [t1]), ...groups])]);
    const x = grp("X", "Moved group", [t2]);
    const base = [spc("A", "Hobby", [p([]), q([x])]), spc("B", "Personal", [])];
    const local = [spc("A", "Hobby", [q([])]), spc("B", "Personal", [p([x])])];
    const r = merge3(base, base, local);
    expect(r.conflicts).toHaveLength(0);
    expect(spaceOf(r.merged)).toEqual(["B"]);
    const moved = r.merged.find((s) => s.id === "B")!.projects[0].categories[0].groups.map((g) => g.id);
    expect(moved).toEqual(["Pg", "X"]);
    expect(r.merged.find((s) => s.id === "A")!.projects[0].categories[0].groups).toEqual([]);
    unique(r.merged);
  });

  it("tolerates containers without a children list", () => {
    // B first, so finding P walks a space with no project list.
    const base = [{ id: "B", name: "Personal", order: 0 } as unknown as SavedSpace, spc("A", "Hobby", [project()])];
    const local = [{ id: "B", name: "Personal", order: 0, projects: [project()] } as SavedSpace, spc("A", "Hobby", [])];
    const r = merge3(base, base, local);
    expect(spaceOf(r.merged)).toEqual(["B"]);
    unique(r.merged);
  });

  it("does not change its inputs", () => {
    const base = tree("A"), server = tree("A", project([t1, t2])), local = tree("B");
    const before = JSON.stringify([base, server, local]);
    merge3(base, server, local);
    expect(JSON.stringify([base, server, local])).toBe(before);
  });

  it("without a base nothing counts as a move (first sync stays a union)", () => {
    const r = merge3(null, tree("A"), tree("B"));
    expect(spaceOf(r.merged)).toEqual(["A", "B"]);
  });
});

// --- order ---
// Order is never a conflict, but a reorder must survive a merge: lists used to
// come out in the account's order, dropping this device's reorder.
describe("merge3 — order", () => {
  const g = (id: string, order = 0) => ({ ...grp(id, id.toUpperCase()), order });
  const at = (...ids: string[]) => wrap(ids.map((id, i) => g(id, i)));
  const order = (spaces: SavedSpace[]) => groupsOf(spaces).map((x) => x.id).join("");

  it("keeps this device's reorder when the account did not reorder", () => {
    expect(order(merge3(at("a", "b", "c"), at("a", "b", "c"), at("c", "a", "b")).merged)).toBe("cab");
  });

  it("takes the account's reorder when this device did not reorder", () => {
    expect(order(merge3(at("a", "b", "c"), at("b", "c", "a"), at("a", "b", "c")).merged)).toBe("bca");
  });

  it("keeps this device's order when both reordered, with no conflict", () => {
    const r = merge3(at("a", "b", "c"), at("b", "c", "a"), at("c", "a", "b"));
    expect(order(r.merged)).toBe("cab");
    expect(r.conflicts).toHaveLength(0);
  });

  it("keeps a reorder while the other side edits or adds elsewhere", () => {
    const server = at("a", "b", "c"); groupsOf(server)[1].name = "Renamed";
    const r = merge3(at("a", "b", "c"), server, at("c", "a", "b"));
    expect(order(r.merged)).toBe("cab");
    expect(groupsOf(r.merged).find((x) => x.id === "b")!.name).toBe("Renamed");
  });

  it("puts an item added on one side next to the neighbour it was added after", () => {
    expect(order(merge3(at("a", "b", "c"), at("a", "x", "b", "c"), at("c", "a", "b")).merged)).toBe("caxb");
    expect(order(merge3(at("a", "b", "c"), at("b", "c", "a"), at("y", "a", "b", "c")).merged)).toBe("ybca");
  });

  it("falls back to an earlier neighbour when the nearest one was deleted", () => {
    // b deleted on the account; this device added x right after b.
    expect(order(merge3(at("a", "b"), at("a"), at("a", "b", "x")).merged)).toBe("ax");
  });

  it("puts items both sides added after the same neighbour in the account's order first", () => {
    expect(order(merge3(at("a"), at("a", "p"), at("a", "n")).merged)).toBe("apn");
  });

  it("reads order as shown (by the order field), so a group added at the top stays on top", () => {
    const local = wrap([g("a", 0), g("b", 1), g("n", -1)]); // created at the top, stored last
    const r = merge3(at("a", "b"), at("a", "b"), local);
    expect(order(r.merged)).toBe("nab");
    expect(groupsOf(r.merged).map((x) => x.order)).toEqual([0, 1, 2]);
  });

  it("keeps a reorder at the project and space levels too", () => {
    const tree = (ids: string[]) => ids.map((id, i) => ({ ...spc(id, id), order: i }));
    expect(merge3(tree(["s", "t", "u"]), tree(["s", "t", "u"]), tree(["u", "s", "t"])).merged.map((x) => x.id)).toEqual(["u", "s", "t"]);
  });
});

describe("merge3 — records missing optional fields (synced from older clients)", () => {
  it("names a conflicting tab by its URL when it has no title", () => {
    const untitled = (url: string) => ({ id: "t", url, favicon: "", order: 0 }) as unknown as ReturnType<typeof tab>;
    const r = merge3(wrap([grp("g", "G", [untitled("https://a")])]), wrap([grp("g", "G", [untitled("https://b")])]), wrap([grp("g", "G", [untitled("https://c")])]));
    expect(r.conflicts).toEqual([expect.objectContaining({ kind: "field", field: "url", name: "https://b" })]);
  });

  it("merges a space with no name and no project list on either side", () => {
    const bare = { id: "s", order: 0 } as unknown as SavedSpace;
    const r = merge3([bare], [{ ...bare }], [{ ...bare, color: "red" } as unknown as SavedSpace]);
    expect(r.conflicts).toEqual([]);
    expect(r.merged).toEqual([expect.objectContaining({ id: "s", color: "red", projects: [] })]);
  });

  it("names conflicts inside unnamed containers with empty labels, never \"undefined\"", () => {
    const unnamed = <T,>(x: T) => { const { name: _drop, ...rest } = x as any; return rest as T; };
    const tree = (title: string) => [spc("s", "S", [unnamed(prj("p", "", [unnamed(cat("c", "", [unnamed(grp("g", "", [tab("t", title)]))]))]))])];
    const r = merge3(tree("Base"), tree("Server"), tree("Local"));
    expect(r.conflicts).toEqual([expect.objectContaining({ kind: "field", field: "title", name: "Server" })]);
    expect(r.conflicts[0].path).toBe("S /  /  / ");
  });

  it("names a conflicting tab with neither title nor URL as empty", () => {
    const bare = (favicon: string) => ({ id: "t", favicon, order: 0 }) as unknown as ReturnType<typeof tab>;
    const r = merge3(wrap([grp("g", "G", [bare("a")])]), wrap([grp("g", "G", [bare("b")])]), wrap([grp("g", "G", [bare("c")])]));
    expect(r.conflicts).toEqual([expect.objectContaining({ kind: "field", field: "favicon", name: "" })]);
  });
});
