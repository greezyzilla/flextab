import { beforeEach, describe, expect, it, vi } from "vitest"
import * as yjs from "~src/lib/yjsDoc"
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore"
import { moveGroupTo, moveTabTo, resolvePickedGroup } from "./moveTo"

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
