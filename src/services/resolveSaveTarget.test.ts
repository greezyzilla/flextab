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

describe("ensureSaveTargetPath (ensure-or-create)", () => {
  it("reuses existing project/category/group", () => {
    const t = ensureSaveTargetPath("s1", { projectId: "p1", categoryId: "c1" });
    expect(t).toEqual({
      spaceId: "s1",
      projectId: "p1",
      categoryId: "c1",
      groupId: "g1",
    });
  });

  it("creates Default Project/Category/Group on empty space", () => {
    const t = ensureSaveTargetPath("s2");
    expect(t).not.toBeNull();
    expect(t!.spaceId).toBe("s2");
    expect(t!.projectId).toBeTruthy();
    expect(t!.categoryId).toBeTruthy();
    expect(t!.groupId).toBeTruthy();

    const space = yjs.getSpaces().find((s) => s.id === "s2")!;
    expect(space.projects).toHaveLength(1);
    expect(space.projects[0].name).toBe("Default Project");
    expect(space.projects[0].categories[0].name).toBe("Default Category");
    expect(space.projects[0].categories[0].groups[0].name).toBe("Default Group");
  });

  it("returns null for unknown space", () => {
    expect(ensureSaveTargetPath("nope")).toBeNull();
  });
});
