import { afterEach, describe, expect, it } from "vitest";
import { fitToScreen, readStoredShellShape, SHELL_SHAPE_STORAGE_KEY, storeShellShape, windowsShape, workspaceShape } from "./shellShape";
import type { SavedSpace } from "~src/types";

afterEach(() => localStorage.clear());

const tabs = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `t${i}`, url: `https://x.test/${i}`, title: "secret title", order: i }));
const spaces = [
  { id: "s1", name: "Work", order: 0, projects: [
    { id: "p1", name: "Launch", order: 0, categories: [
      { id: "c1", name: "Research", order: 0, groups: [
        { id: "u", name: "Unsorted", order: 0, config: { kind: "unsorted" }, tabs: tabs(2) },
        { id: "g1", name: "A", order: 1, tabs: tabs(3) },
        { id: "g2", name: "B", order: 2, tabs: tabs(0) },
      ] },
      { id: "c2", name: "Design", order: 1, groups: [] },
    ] },
    { id: "p2", name: "Later", order: 1, categories: [{ id: "c3", name: "X", order: 0, groups: [{ id: "g3", name: "C", order: 0, tabs: tabs(1) }] }] },
  ] },
  { id: "s2", name: "Home", order: 1, projects: [] },
] as unknown as SavedSpace[];

describe("shell shape", () => {
  const state = { savedSpaces: spaces, activeSpaceId: "s1", activeProjectId: "p1", activeCategoryId: "c1", expandedProjectIds: ["p1"] };

  it("keeps counts and choices only: spaces, open projects, group badges, the selection, Unsorted, groups and tabs", () => {
    const shape = workspaceShape(state, "grid", 3);
    expect(shape).toEqual({
      spaces: 2,
      projects: [{ open: true, categories: [2, 0] }, { open: false, categories: [1] }],
      active: [0, 0],
      content: { layout: "grid", gridColumns: 3, projectHasGroups: true, sections: [{ unsorted: 2, groups: [3, 0] }, { unsorted: null, groups: [] }] },
      anyTabs: true,
    });
    expect(JSON.stringify(shape)).not.toMatch(/secret|Research|https/);
  });

  it("knows when nothing is saved yet, for the first-run box", () => {
    const empty = spaces.map((sp) => ({ ...sp, projects: sp.projects.map((p) => ({ ...p, categories: p.categories.map((c) => ({ ...c, groups: c.groups.map((g) => ({ ...g, tabs: [] })) })) })) }));
    expect(workspaceShape({ ...state, savedSpaces: empty }, "list", 2).anyTabs).toBe(false);
  });

  it("starts the content at the selected category", () => {
    expect(workspaceShape({ ...state, activeCategoryId: "c2" }, "list", 2).content?.sections).toEqual([{ unsorted: null, groups: [] }]);
  });

  it("has no content when the project has no categories or nothing is picked", () => {
    expect(workspaceShape({ ...state, activeProjectId: null, activeCategoryId: null }, "list", 2).content).toBeNull();
  });

  it("round-trips through storage, merging the windows part, and drops a broken copy", () => {
    storeShellShape(workspaceShape(state, "list", 2));
    storeShellShape({ windows: windowsShape([4, 400]) });
    expect(readStoredShellShape()?.windows).toEqual([4, 200]);
    expect(readStoredShellShape()?.spaces).toBe(2);
    localStorage.setItem(SHELL_SHAPE_STORAGE_KEY, JSON.stringify({ spaces: -1 }));
    expect(readStoredShellShape()).toBeNull();
    localStorage.setItem(SHELL_SHAPE_STORAGE_KEY, "{oops");
    expect(readStoredShellShape()).toBeNull();
  });
});

describe("fitToScreen", () => {
  const big = {
    spaces: 3,
    projects: [{ open: true, categories: Array(40).fill(1) }, { open: true, categories: [1] }],
    active: null,
    content: { layout: "list" as const, gridColumns: 2, projectHasGroups: true, sections: [{ unsorted: 5, groups: [120, 4] }, { unsorted: null, groups: [3] }] },
    windows: [150, 2],
  };

  it("draws a big group past the bottom of the screen, never fewer rows than fit", () => {
    const fit = fitToScreen(big, 900);
    const drawn = fit.content!.sections[0].groups[0];
    // Header (2 rows), Unsorted (5 tabs + its header), the group's header, then its rows: past 900px.
    expect((2 + 5 + 2 + 2 + drawn) * 39).toBeGreaterThan(900);
    expect(drawn).toBeLessThan(120);
    expect(fit.content!.sections).toHaveLength(1);
  });

  it("counts a grid tab as if every column were there, so the cut stays below the fold", () => {
    const list = fitToScreen(big, 900).content!.sections[0];
    const grid = fitToScreen({ ...big, content: { ...big.content, layout: "grid", gridColumns: 3 } }, 900).content!.sections[0];
    expect(grid.groups[0]).toBeGreaterThan(list.groups[0]);
  });

  it("cuts the tree and the open windows at the screen too", () => {
    const fit = fitToScreen(big, 900);
    expect(fit.projects[0].categories.length * 32).toBeGreaterThan(900 - 64);
    expect(fit.projects[0].categories.length).toBeLessThan(40);
    expect(fit.windows[0] * 45).toBeGreaterThan(900 - 120);
    expect(fit.windows.length).toBe(1);
  });

  it("keeps a small workspace whole", () => {
    const small = { ...big, projects: [{ open: true, categories: [1, 0] }], content: { ...big.content, sections: [{ unsorted: null, groups: [2, 0] }] }, windows: [3] };
    expect(fitToScreen(small, 900)).toEqual(small);
  });
});

describe("a stored shell shape that is not usable is dropped", () => {
  const good = { spaces: 1, windows: [2], projects: [{ open: true, categories: [1] }], active: [0, 0], content: null };

  it.each([
    ["a project without its open flag", { projects: [{ categories: [1] }] }],
    ["a project with bad category counts", { projects: [{ open: true, categories: [-1] }] }],
    ["anyTabs that is not a boolean", { anyTabs: "yes" }],
    ["a selection that is not two counts", { active: [0] }],
    ["content with an unknown layout", { content: { layout: "masonry", gridColumns: 2, projectHasGroups: true, sections: [] } }],
  ])("rejects %s", (_, change) => {
    localStorage.setItem(SHELL_SHAPE_STORAGE_KEY, JSON.stringify({ ...good, ...change }))
    expect(readStoredShellShape()).toBeNull()
  })

  it("accepts the same shape when it is whole", () => {
    localStorage.setItem(SHELL_SHAPE_STORAGE_KEY, JSON.stringify({ ...good, anyTabs: true }))
    expect(readStoredShellShape()).toMatchObject({ spaces: 1, anyTabs: true })
  })

  it("keeps working when storage refuses the write", () => {
    const setItem = Storage.prototype.setItem
    Storage.prototype.setItem = () => { throw new Error("quota") }
    try {
      expect(() => storeShellShape({ spaces: 3 })).not.toThrow()
    } finally { Storage.prototype.setItem = setItem }
  })
})

describe("workspaceShape edges", () => {
  it("draws no projects when the selected space is gone", () => {
    const shape = workspaceShape({ savedSpaces: spaces, activeSpaceId: "missing", activeProjectId: null, activeCategoryId: null, expandedProjectIds: [] }, "list", 2)
    expect(shape.projects).toEqual([])
    expect(shape.content).toBeNull()
  })

  it("falls back to two grid columns and orders items without an order first", () => {
    const unordered = [{ ...spaces[0], projects: [
      { id: "pa", name: "A", order: 1, categories: [{ id: "ca", name: "C", order: 0, groups: [{ id: "g", name: "G", tabs: [] }] }] },
      { id: "pb", name: "B", categories: [{ id: "cb", name: "D", groups: [] }] },
    ] }] as unknown as SavedSpace[]
    const shape = workspaceShape({ savedSpaces: unordered, activeSpaceId: "s1", activeProjectId: "pa", activeCategoryId: "ca", expandedProjectIds: ["pb"] }, "grid", 0)
    expect(shape.content?.gridColumns).toBe(2)
    expect(shape.projects[0].open).toBe(true) // pb, with no order, sorts first
  })
})
