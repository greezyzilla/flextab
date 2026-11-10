import { beforeEach, describe, expect, it, vi } from "vitest"
import * as yjs from "~src/lib/yjsDoc"
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore"
import { moveCategoryTo, moveGroupTo, moveProjectTo, moveTabTo, resolvePickedGroup } from "./moveTo"

vi.mock("~src/utils/favicon", () => ({ faviconToDataUrl: vi.fn(async (u: string) => u) }))

const tab = (id: string, url: string) => ({ id, url, title: id, favicon: "", order: 0 })

beforeEach(async () => {
  await yjs.clearState()
  yjs.setSpaces([{ id: "s", name: "Work", order: 0, projects: [{ id: "p", name: "Site", order: 0, categories: [
    { id: "c1", name: "Research", order: 0, groups: [
      { id: "g1", name: "Reading", order: 0, tabs: [tab("t1", "https://a.com")] },
      { id: "g2", name: "Later", order: 1, tabs: [] },
    ] },
    { id: "c2", name: "Design", order: 1, groups: [] },
  ] }] }])
  useSavedSpacesStore.setState({ savedSpaces: yjs.getSpaces() })
})

const category = (id: string) => yjs.getSpaces()[0].projects[0].categories.find((c) => c.id === id)!
const at = { spaceId: "s", projectId: "p" }

describe("Move to… (TASK-5)", () => {
  it("resolves the picked group, a new named group at the top, or Unsorted", () => {
    expect(resolvePickedGroup({ ...at, categoryId: "c1", groupId: "g2" })).toBe("g2")
    const created = resolvePickedGroup({ ...at, categoryId: "c1", newGroupName: " Ideas " })!
    expect(category("c1").groups.find((g) => g.id === created)).toMatchObject({ name: "Ideas", order: -1 })
    const unsorted = resolvePickedGroup({ ...at, categoryId: "c2" })!
    expect(category("c2").groups.find((g) => g.id === unsorted)?.config).toEqual({ kind: "unsorted" })
    expect(resolvePickedGroup({ ...at, categoryId: "gone" })).toBeNull()
  })

  it("moves a tab within its category and across categories", () => {
    moveTabTo({ ...at, categoryId: "c1", groupId: "g1" }, "t1", { ...at, categoryId: "c1", groupId: "g2" })
    expect(category("c1").groups.find((g) => g.id === "g2")!.tabs.map((t) => t.id)).toEqual(["t1"])
    moveTabTo({ ...at, categoryId: "c1", groupId: "g2" }, "t1", { ...at, categoryId: "c2" })
    expect(category("c2").groups[0].tabs.map((t) => t.id)).toEqual(["t1"])
  })

  it("leaves a tab alone when the target is its own group or missing", () => {
    moveTabTo({ ...at, categoryId: "c1", groupId: "g1" }, "t1", { ...at, categoryId: "c1", groupId: "g1" })
    moveTabTo({ ...at, categoryId: "c1", groupId: "g1" }, "t1", { ...at, categoryId: "gone" })
    expect(category("c1").groups.find((g) => g.id === "g1")!.tabs).toHaveLength(1)
  })

  it("moves a group to another category, and ignores its own category", () => {
    moveGroupTo({ ...at, categoryId: "c1" }, "g1", { ...at, categoryId: "c1" })
    moveGroupTo({ ...at, categoryId: "c1" }, "g1", { ...at, categoryId: "gone" })
    expect(category("c1").groups.map((g) => g.id)).toContain("g1")
    moveGroupTo({ ...at, categoryId: "c1" }, "g1", { ...at, categoryId: "c2" })
    expect(category("c2").groups.map((g) => g.id)).toEqual(["g1"])
  })
})

describe("moving a project or a category (TASK-59)", () => {
  const cat = (id: string) => ({ id, name: id, order: 0, groups: [] })
  const prj = (id: string, categories = [cat(`${id}c`)]) => ({ id, name: id, order: 0, categories })
  beforeEach(() => {
    yjs.setSpaces([
      { id: "H", name: "Hobby", order: 0, projects: [prj("A"), prj("B", [cat("m1"), cat("m2"), cat("m3")]), prj("C")] },
      { id: "P", name: "Personal", order: 1, projects: [prj("X")] },
    ])
    useSavedSpacesStore.setState({ savedSpaces: yjs.getSpaces(), activeSpaceId: "H", activeProjectId: "B", activeCategoryId: "m2" })
  })
  const projectsIn = (spaceId: string) => yjs.getSpaces().find((s) => s.id === spaceId)!.projects.map((p) => p.id)
  const categoriesIn = (spaceId: string, projectId: string) =>
    yjs.getSpaces().find((s) => s.id === spaceId)!.projects.find((p) => p.id === projectId)!.categories.map((c) => c.id)

  it("moves a project to the end of another space, opens its neighbour, and undoes to the old position", () => {
    const undo = moveProjectTo("H", "B", "P")!
    expect(projectsIn("H")).toEqual(["A", "C"])
    expect(projectsIn("P")).toEqual(["X", "B"])
    expect(useSavedSpacesStore.getState()).toMatchObject({ activeSpaceId: "H", activeProjectId: "C", activeCategoryId: "Cc" })
    undo()
    expect(projectsIn("H")).toEqual(["A", "B", "C"])
    expect(projectsIn("P")).toEqual(["X"])
    expect(yjs.getSpaces()[0].projects.map((p) => p.order)).toEqual([0, 1, 2])
  })

  it("opens the previous project when the last one leaves, and nothing when none is left", () => {
    useSavedSpacesStore.setState({ activeProjectId: "C" })
    moveProjectTo("H", "C", "P")
    expect(useSavedSpacesStore.getState().activeProjectId).toBe("B")
    useSavedSpacesStore.setState({ activeSpaceId: "P", activeProjectId: "X" })
    for (const id of ["X", "C"]) moveProjectTo("P", id, "H")
    expect(projectsIn("P")).toEqual([])
    expect(useSavedSpacesStore.getState().activeProjectId).toBeNull()
  })

  it("keeps the selection when the moved project was not open", () => {
    moveProjectTo("H", "A", "P")
    expect(useSavedSpacesStore.getState().activeProjectId).toBe("B")
  })

  it("keeps both when the target already has a project with the same name (matched by id, never by name)", () => {
    yjs.setSpaces([
      { id: "H", name: "Hobby", order: 0, projects: [prj("A")] },
      { id: "P", name: "Personal", order: 1, projects: [{ ...prj("Z"), name: "A" }] },
    ])
    useSavedSpacesStore.setState({ savedSpaces: yjs.getSpaces() })
    moveProjectTo("H", "A", "P")
    expect(yjs.getSpaces()[1].projects.map((p) => `${p.id}:${p.name}`)).toEqual(["Z:A", "A:A"])
  })

  it("does nothing for the same space or a missing project or space", () => {
    expect(moveProjectTo("H", "B", "H")).toBeNull()
    expect(moveProjectTo("H", "gone", "P")).toBeNull()
    expect(moveProjectTo("H", "B", "gone")).toBeNull()
    expect(moveProjectTo("gone", "B", "P")).toBeNull()
    expect(projectsIn("H")).toEqual(["A", "B", "C"])
  })

  it("moves a category to a project in another space, opens its neighbour, and undoes to the old position", () => {
    const undo = moveCategoryTo({ spaceId: "H", projectId: "B" }, "m2", { spaceId: "P", projectId: "X" })!
    expect(categoriesIn("H", "B")).toEqual(["m1", "m3"])
    expect(categoriesIn("P", "X")).toEqual(["Xc", "m2"])
    expect(useSavedSpacesStore.getState().activeCategoryId).toBe("m3")
    undo()
    expect(categoriesIn("H", "B")).toEqual(["m1", "m2", "m3"])
    expect(categoriesIn("P", "X")).toEqual(["Xc"])
  })

  it("does nothing for the same project or a missing category or project", () => {
    expect(moveCategoryTo({ spaceId: "H", projectId: "B" }, "m2", { spaceId: "H", projectId: "B" })).toBeNull()
    expect(moveCategoryTo({ spaceId: "H", projectId: "B" }, "gone", { spaceId: "P", projectId: "X" })).toBeNull()
    expect(moveCategoryTo({ spaceId: "H", projectId: "B" }, "m2", { spaceId: "P", projectId: "gone" })).toBeNull()
    expect(moveCategoryTo({ spaceId: "H", projectId: "gone" }, "m2", { spaceId: "P", projectId: "X" })).toBeNull()
  })

  it("undo does nothing once the item or its old place is gone", () => {
    const undoProject = moveProjectTo("H", "A", "P")!
    moveProjectTo("P", "A", "H") // moved on again before Undo
    undoProject()
    expect(projectsIn("H")).toEqual(["B", "C", "A"])
    const undoCategory = moveCategoryTo({ spaceId: "H", projectId: "B" }, "m1", { spaceId: "P", projectId: "X" })!
    useSavedSpacesStore.getState().removeSavedProject("H", yjs.getSpaces()[0].projects.find((p) => p.id === "B")!)
    useSavedSpacesStore.setState({ savedSpaces: yjs.getSpaces() })
    undoCategory()
    expect(categoriesIn("P", "X")).toEqual(["Xc", "m1"])
  })
})
