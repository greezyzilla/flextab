import { beforeEach, describe, expect, it } from "vitest"
import * as yjs from "~src/lib/yjsDoc"
import { createSpace, ensureCategoryPath, ensureSpace, ensureUnsortedGroup, ensureUnsortedPath, findUnsorted, firstGroupOrder, isUnsortedGroup, orderedGroups } from "./defaultPath"

beforeEach(async () => {
  await yjs.clearState()
  yjs.setSpaces([{ id: "s", name: "Work", order: 0, projects: [{ id: "p", name: "Site", order: 0, categories: [
    { id: "c", name: "Research", order: 0, groups: [] },
    { id: "c2", name: "Design", order: 1, groups: [] },
  ] }] }])
})

const category = (id: string) => yjs.getSpaces()[0].projects[0].categories.find((c) => c.id === id)!

describe("default path", () => {
  it("prefers the given category, else the first one", () => {
    expect(ensureCategoryPath("s", { projectId: "p", categoryId: "c2" })).toEqual({ spaceId: "s", projectId: "p", categoryId: "c2" })
    expect(ensureCategoryPath("s", { projectId: "gone", categoryId: "gone" })).toEqual({ spaceId: "s", projectId: "p", categoryId: "c" })
    expect(ensureCategoryPath("nope")).toBeNull()
  })

  it("ensureSpace returns the first space, or creates Personal with a fresh id (TASK-37)", () => {
    expect(ensureSpace()).toBe("s")
    expect(yjs.getSpaces()).toHaveLength(1)
    yjs.setSpaces([])
    const a = ensureSpace()
    expect(yjs.getSpaces()).toEqual([{ id: a, name: "Personal", order: 0, projects: [] }])
    yjs.setSpaces([])
    expect(ensureSpace()).not.toBe(a)
  })

  it("creates one Unsorted per category, first and marked", () => {
    const id = ensureUnsortedGroup({ spaceId: "s", projectId: "p", categoryId: "c" })!
    expect(ensureUnsortedGroup({ spaceId: "s", projectId: "p", categoryId: "c" })).toBe(id)
    expect(findUnsorted(category("c"))).toMatchObject({ id, name: "Unsorted", order: -1, config: { kind: "unsorted" } })
    expect(findUnsorted(category("c2"))).toBeUndefined()
    expect(ensureUnsortedGroup({ spaceId: "s", projectId: "p", categoryId: "gone" })).toBeNull()
    expect(ensureUnsortedPath("s", { projectId: "p", categoryId: "c" })).toEqual({ spaceId: "s", projectId: "p", categoryId: "c", groupId: id })
    expect(ensureUnsortedPath("nope")).toBeNull()
  })

  it("createSpace starts a named space with General › Uncategorized and no group, appended (TASK-98)", () => {
    const id = createSpace("Atelier", "#8b5cf6")
    const space = yjs.getSpaces().find((s) => s.id === id)!
    expect(space).toMatchObject({ name: "Atelier", color: "#8b5cf6", order: 1 })
    expect(space.projects).toHaveLength(1)
    expect(space.projects[0]).toMatchObject({ name: "General", order: 0 })
    expect(space.projects[0].categories).toEqual([expect.objectContaining({ name: "Uncategorized", order: 0, groups: [] })])
    const plain = createSpace("Plain")
    expect("color" in yjs.getSpaces().find((s) => s.id === plain)!).toBe(false)
  })

  it("the first save into a created space uses its path and adds Unsorted there (TASK-98 keeps TASK-20)", () => {
    const id = createSpace("Atelier")
    const project = yjs.getSpaces().find((s) => s.id === id)!.projects[0]
    const path = ensureUnsortedPath(id)!
    expect(path).toMatchObject({ spaceId: id, projectId: project.id, categoryId: project.categories[0].id })
    const after = yjs.getSpaces().find((s) => s.id === id)!
    expect(after.projects).toHaveLength(1)
    expect(after.projects[0].categories).toHaveLength(1)
    expect(after.projects[0].categories[0].groups).toEqual([expect.objectContaining({ id: path.groupId, name: "Unsorted" })])
  })

  it("orders Unsorted first, then the user's groups by order", () => {
    const groups = [
      { id: "b", order: 2 },
      { id: "u", order: 5, config: { kind: "unsorted" as const } },
      { id: "a" },
      { id: "z" },
    ]
    expect(orderedGroups(groups).map((g) => g.id)).toEqual(["u", "a", "z", "b"])
    expect(isUnsortedGroup(undefined)).toBe(false)
  })

  it("puts a new group before the user's groups, ignoring Unsorted", () => {
    expect(firstGroupOrder([])).toBe(0)
    expect(firstGroupOrder([{ order: -1, config: { kind: "unsorted" } }])).toBe(0)
    expect(firstGroupOrder([{ order: 3 }, { order: 1 }, {}, { order: -1, config: { kind: "unsorted" } }])).toBe(-1)
  })
})
