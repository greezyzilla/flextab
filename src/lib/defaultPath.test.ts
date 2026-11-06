import { beforeEach, describe, expect, it } from "vitest"
import * as yjs from "~src/lib/yjsDoc"
import { ensureCategoryPath, ensureUnsortedGroup, ensureUnsortedPath, findUnsorted, isUnsortedGroup, orderedGroups } from "./defaultPath"

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

  it("creates one Unsorted per category, first and marked", () => {
    const id = ensureUnsortedGroup({ spaceId: "s", projectId: "p", categoryId: "c" })!
    expect(ensureUnsortedGroup({ spaceId: "s", projectId: "p", categoryId: "c" })).toBe(id)
    expect(findUnsorted(category("c"))).toMatchObject({ id, name: "Unsorted", order: -1, config: { kind: "unsorted" } })
    expect(findUnsorted(category("c2"))).toBeUndefined()
    expect(ensureUnsortedGroup({ spaceId: "s", projectId: "p", categoryId: "gone" })).toBeNull()
    expect(ensureUnsortedPath("s", { projectId: "p", categoryId: "c" })).toEqual({ spaceId: "s", projectId: "p", categoryId: "c", groupId: id })
    expect(ensureUnsortedPath("nope")).toBeNull()
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
})
