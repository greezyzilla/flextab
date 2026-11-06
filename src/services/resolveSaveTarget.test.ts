import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveSaveTargetIds, ensureSaveTargetPath } from "./resolveSaveTarget";
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore";
import * as yjs from "~src/lib/yjsDoc";
import type { SavedSpace } from "~src/types";

const emptySpace = (id: string): SavedSpace => ({
  id,
  name: id,
  order: 0,
  projects: [],
});

const fullTree = (): SavedSpace[] => [
  {
    id: "s1",
    name: "S1",
    order: 0,
    projects: [
      {
        id: "p1",
        name: "P1",
        order: 0,
        categories: [
          { id: "c1", name: "C1", order: 0, groups: [{ id: "g1", name: "G1", order: 0, tabs: [] }] },
          { id: "c2", name: "C2", order: 1, groups: [] },
        ],
      },
      {
        id: "p2",
        name: "P2",
        order: 1,
        categories: [{ id: "c3", name: "C3", order: 0, groups: [] }],
      },
    ],
  },
  emptySpace("s2"),
];

beforeEach(async () => {
  vi.clearAllMocks();
  await yjs.clearState();
  yjs.setSpaces(fullTree());
  useSavedSpacesStore.setState({ savedSpaces: yjs.getSpaces() });
});

describe("resolveSaveTargetIds (select-existing)", () => {
  it("uses preferred ids when valid", () => {
    expect(
      resolveSaveTargetIds(fullTree(), {
        spaceId: "s1",
        projectId: "p2",
        categoryId: "c3",
      }),
    ).toEqual({ spaceId: "s1", projectId: "p2", categoryId: "c3" });
  });

  it("falls back to first project/category when preferred missing", () => {
    expect(resolveSaveTargetIds(fullTree(), { spaceId: "s1" })).toEqual({
      spaceId: "s1",
      projectId: "p1",
      categoryId: "c1",
    });
  });

  it("returns empty project/category when space has no children (never creates)", () => {
    expect(resolveSaveTargetIds(fullTree(), { spaceId: "s2" })).toEqual({
      spaceId: "s2",
      projectId: "",
      categoryId: "",
    });
    // Pure — store unchanged
    expect(
      useSavedSpacesStore.getState().savedSpaces.find((s) => s.id === "s2")
        ?.projects,
    ).toEqual([]);
  });
});

describe("ensureSaveTargetPath (never invents projects/categories)", () => {
  it("reuses existing project/category/group", () => {
    const t = ensureSaveTargetPath("s1", { projectId: "p1", categoryId: "c1" });
    expect(t).toEqual({
      spaceId: "s1",
      projectId: "p1",
      categoryId: "c1",
      groupId: "g1",
    });
  });

  it("reports a missing project on an empty space and creates nothing", () => {
    expect(ensureSaveTargetPath("s2")).toEqual({ missing: "project", spaceId: "s2" });
    expect(yjs.getSpaces().find((s) => s.id === "s2")!.projects).toEqual([]);
  });

  it("reports a missing category and creates nothing", () => {
    yjs.addProject("s2", { id: "p9", name: "P9", order: 0, categories: [] });
    useSavedSpacesStore.setState({ savedSpaces: yjs.getSpaces() });
    expect(ensureSaveTargetPath("s2")).toEqual({ missing: "category", spaceId: "s2", projectId: "p9" });
    expect(yjs.getSpaces().find((s) => s.id === "s2")!.projects[0].categories).toEqual([]);
  });

  it("creates only the receiving group when the category has none", () => {
    const t = ensureSaveTargetPath("s1", { projectId: "p1", categoryId: "c2" });
    expect(t).toMatchObject({ spaceId: "s1", projectId: "p1", categoryId: "c2" });
    const c2 = yjs.getSpaces()[0].projects[0].categories.find((c) => c.id === "c2")!;
    expect(c2.groups).toHaveLength(1);
    expect(c2.groups[0].name).toBe("New Group");
    expect(yjs.getSpaces()[0].projects).toHaveLength(2);
  });

  it("returns null for unknown space", () => {
    expect(ensureSaveTargetPath("nope")).toBeNull();
  });
});
