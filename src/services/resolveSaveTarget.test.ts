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

describe("ensureSaveTargetPath (default path down to Unsorted)", () => {
  const groupsOf = (spaceId: string) => yjs.getSpaces().find((s) => s.id === spaceId)!.projects[0].categories[0].groups;

  it("saves into the preferred category's Unsorted, never into a user group", () => {
    const t = ensureSaveTargetPath("s1", { projectId: "p1", categoryId: "c1" })!;
    expect(t).toMatchObject({ spaceId: "s1", projectId: "p1", categoryId: "c1" });
    const unsorted = groupsOf("s1").find((g) => g.id === t.groupId)!;
    expect(unsorted).toMatchObject({ name: "Unsorted", config: { kind: "unsorted" } });
    expect(t.groupId).not.toBe("g1");
  });

  it("reuses the existing Unsorted instead of adding a second one", () => {
    const a = ensureSaveTargetPath("s1", { projectId: "p1", categoryId: "c1" })!;
    const b = ensureSaveTargetPath("s1", { projectId: "p1", categoryId: "c1" })!;
    expect(b.groupId).toBe(a.groupId);
    expect(groupsOf("s1").filter((g) => g.config?.kind === "unsorted")).toHaveLength(1);
  });

  it("creates General › Uncategorized › Unsorted on an empty space", () => {
    const t = ensureSaveTargetPath("s2")!;
    const project = yjs.getSpaces().find((s) => s.id === "s2")!.projects[0];
    expect(project.name).toBe("General");
    expect(project.categories.map((c) => c.name)).toEqual(["Uncategorized"]);
    expect(t).toMatchObject({ spaceId: "s2", projectId: project.id, categoryId: project.categories[0].id });
    expect(project.categories[0].groups.map((g) => g.name)).toEqual(["Unsorted"]);
  });

  it("keeps the user's project and only adds the missing category", () => {
    yjs.addProject("s2", { id: "p9", name: "P9", order: 0, categories: [] });
    const t = ensureSaveTargetPath("s2")!;
    const projects = yjs.getSpaces().find((s) => s.id === "s2")!.projects;
    expect(projects.map((p) => p.name)).toEqual(["P9"]);
    expect(t.projectId).toBe("p9");
    expect(projects[0].categories.map((c) => c.name)).toEqual(["Uncategorized"]);
  });

  it("returns null for unknown space", () => {
    expect(ensureSaveTargetPath("nope")).toBeNull();
  });
});
