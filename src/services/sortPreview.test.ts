import { beforeEach, describe, expect, it } from "vitest"
import * as yjs from "~src/lib/yjsDoc"
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore"
import { commitPreview, groupPreview, tabPreview, userGroups, withPreview, type SortPreview } from "./sortPreview"
import { orderedGroups } from "~src/lib/defaultPath"
import type { SavedSpace } from "~src/types"

const tab = (id: string, order: number) => ({ id, url: `https://${id}.test`, title: id, favicon: "", order })
const tree = (): SavedSpace[] => [{ id: "s", name: "S", order: 0, projects: [{ id: "p", name: "P", order: 0, categories: [
  { id: "c1", name: "C1", order: 0, groups: [
    { id: "u1", name: "Unsorted", order: 0, config: { kind: "unsorted" }, tabs: [] },
    { id: "g1", name: "G1", order: 1, tabs: [tab("a", 0), tab("b", 1)] },
    { id: "g2", name: "G2", order: 2, tabs: [tab("x", 0), tab("y", 1)] },
  ] },
  { id: "c2", name: "C2", order: 1, groups: [{ id: "g3", name: "G3", order: 0, tabs: [tab("z", 0)] }, { id: "g4", name: "G4", order: 1, tabs: [] }] },
  { id: "c3", name: "C3", order: 2, groups: [] },
] }] }]
const spaces = () => useSavedSpacesStore.getState().savedSpaces
const tabsIn = (groupId: string) => {
  for (const c of yjs.getSpaces()[0].projects[0].categories) for (const g of c.groups) if (g.id === groupId) return [...g.tabs].sort((p, q) => (p.order ?? 0) - (q.order ?? 0)).map((t) => t.id).join("")
  return null
}
const groupsIn = (categoryId: string) => userGroups(yjs.getSpaces()[0].projects[0].categories.find((c) => c.id === categoryId)!.groups).map((g) => g.id).join("")

beforeEach(async () => {
  await yjs.clearState()
  yjs.setSpaces(tree())
  useSavedSpacesStore.setState({ savedSpaces: yjs.getSpaces() })
})

describe("a tab dragged into another group", () => {
  it("goes before the tab under the pointer, or after it on its lower half", () => {
    expect(tabPreview(spaces(), "a", "y", false)).toMatchObject({ kind: "tab", from: "g1", to: "g2", beforeId: "y" })
    expect(tabPreview(spaces(), "a", "x", true)).toMatchObject({ beforeId: "y" })
    expect(tabPreview(spaces(), "a", "y", true)).toMatchObject({ beforeId: null })
  })

  it("goes last over a group's zone, and nowhere within its own group or off any group", () => {
    expect(tabPreview(spaces(), "a", "droppable-g3", false)).toMatchObject({ to: "g3", beforeId: null })
    expect(tabPreview(spaces(), "a", "b", false)).toBeNull()
    expect(tabPreview(spaces(), "a", "droppable-g1", false)).toBeNull()
    expect(tabPreview(spaces(), "a", "cat-drop:s:p:c2", false)).toBeNull()
    expect(tabPreview(spaces(), "a", "droppable-gone", false)).toBeNull()
    expect(tabPreview(spaces(), "gone", "y", false)).toBeNull()
  })

  it("shows the lists as they will be", () => {
    const preview = tabPreview(spaces(), "a", "y", false)!
    const list = (id: string) => [...spaces()[0].projects[0].categories[0].groups.find((g) => g.id === id)!.tabs]
    expect(withPreview(list("g1"), "g1", "tab", preview).map((t) => t.id)).toEqual(["b"])
    expect(withPreview(list("g2"), "g2", "tab", preview).map((t) => t.id)).toEqual(["x", "a", "y"])
    expect(withPreview(list("g2"), "g2", "group", preview).map((t) => t.id)).toEqual(["x", "y"]) // other kind
    expect(withPreview(list("g2"), "g9", "tab", preview).map((t) => t.id)).toEqual(["x", "y"]) // other list
    expect(withPreview(list("g2"), "g2", "tab", null).map((t) => t.id)).toEqual(["x", "y"])
    expect(withPreview(list("g2"), "g2", "tab", { ...preview, beforeId: "gone" }).map((t) => t.id)).toEqual(["x", "y", "a"])
  })

  it("lands where it was shown, in the same category and across categories", () => {
    commitPreview(tabPreview(spaces(), "a", "y", false)!)
    expect(tabsIn("g2")).toBe("xay")
    expect(tabsIn("g1")).toBe("b")
    useSavedSpacesStore.setState({ savedSpaces: yjs.getSpaces() })
    commitPreview(tabPreview(spaces(), "x", "droppable-g3", false)!)
    expect(tabsIn("g3")).toBe("zx")
    useSavedSpacesStore.setState({ savedSpaces: yjs.getSpaces() })
    commitPreview(tabPreview(spaces(), "y", "z", false)!)
    expect(tabsIn("g3")).toBe("yzx")
  })

  it("does nothing when the tab or the group is gone by the drop", () => {
    const preview = tabPreview(spaces(), "a", "y", false)!
    commitPreview({ ...preview, id: "gone" })
    commitPreview({ ...preview, to: "gone" })
    expect(tabsIn("g1")).toBe("ab")
  })
})

describe("a group dragged into another category", () => {
  it("goes before or after the group card under the pointer, before it over a tab inside it", () => {
    expect(groupPreview(spaces(), "g1", "g4", false)).toMatchObject({ kind: "group", from: "c1", to: "c2", beforeId: "g4" })
    expect(groupPreview(spaces(), "g1", "droppable-g3", true)).toMatchObject({ beforeId: "g4" })
    expect(groupPreview(spaces(), "g1", "g4", true)).toMatchObject({ beforeId: null })
    expect(groupPreview(spaces(), "g1", "z", true)).toMatchObject({ beforeId: "g3" })
  })

  it("goes last over an empty section, and nowhere in its own category or for Unsorted", () => {
    expect(groupPreview(spaces(), "g1", "section-drop:s:p:c3", false)).toMatchObject({ to: "c3", beforeId: null })
    expect(groupPreview(spaces(), "g1", "g2", false)).toBeNull()
    expect(groupPreview(spaces(), "u1", "g3", false)).toBeNull()
    expect(groupPreview(spaces(), "g1", "section-drop:s:p:gone", false)).toBeNull()
    expect(groupPreview(spaces(), "g1", "cat-drop:s:p:c2", false)).toBeNull()
    expect(groupPreview(spaces(), "gone", "g3", false)).toBeNull()
  })

  it("goes last over another category's Unsorted, as a drop there always did", () => {
    yjs.setSpaces(tree().map((s) => ({ ...s, projects: s.projects.map((p) => ({ ...p, categories: p.categories.map((c) =>
      c.id === "c2" ? { ...c, groups: [{ id: "u2", name: "Unsorted", order: -1, config: { kind: "unsorted" as const }, tabs: [tab("w", 0)] }, ...c.groups] } : c) })) })))
    useSavedSpacesStore.setState({ savedSpaces: yjs.getSpaces() })
    expect(groupPreview(spaces(), "g1", "w", false)).toMatchObject({ to: "c2", beforeId: null })
  })

  it("lands where it was shown", () => {
    commitPreview(groupPreview(spaces(), "g1", "g4", false)!)
    expect(groupsIn("c2")).toBe("g3g1g4")
    expect(groupsIn("c1")).toBe("g2")
    useSavedSpacesStore.setState({ savedSpaces: yjs.getSpaces() })
    commitPreview(groupPreview(spaces(), "g2", "section-drop:s:p:c3", false)!)
    expect(groupsIn("c3")).toBe("g2")
    expect(orderedGroups(yjs.getSpaces()[0].projects[0].categories[0].groups).map((g) => g.id)).toEqual(["u1"])
  })

  it("does nothing when the group or the category is gone by the drop", () => {
    const preview = groupPreview(spaces(), "g1", "g4", false)! as Extract<SortPreview, { kind: "group" }>
    commitPreview({ ...preview, id: "gone" })
    commitPreview({ ...preview, toLocation: { ...preview.toLocation, categoryId: "gone" } })
    expect(groupsIn("c1")).toBe("g1g2")
  })
})
