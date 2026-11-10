import { describe, expect, it } from "vitest"
import type { SavedSpace, SavedTab } from "~src/types"
import { autoMerged, changeText, diffTrees, editSummary, indexTree, locate } from "./syncChanges"
import { merge3 } from "./spacesMerge3"

const tab = (id: string, title = id, url = `https://${id}.example/`): SavedTab => ({ id, title, url, favicon: "" })
const tree = (groups: Record<string, SavedTab[]>, spaceName = "Work"): SavedSpace[] => [{
  id: "s", name: spaceName, projects: [{ id: "p", name: "General", categories: [{ id: "c", name: "Reading",
    groups: Object.entries(groups).map(([id, tabs]) => ({ id, name: id === "g" ? "Inbox" : id, tabs })) }] }],
}]
const texts = (from: SavedSpace[] | null, to: SavedSpace[]) => diffTrees(from, to).map(changeText)
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))

describe("diffTrees", () => {
  it("counts tabs added to and removed from a group per group", () => {
    const before = tree({ g: [tab("a"), tab("b"), tab("c")] })
    const after = tree({ g: [tab("a"), tab("d"), tab("e")] })
    expect(texts(before, after)).toEqual([
      "Added 2 tabs in Work › General › Reading › Inbox",
      "Removed 2 tabs from Work › General › Reading › Inbox",
    ])
    expect(texts(before, tree({ g: [tab("a"), tab("b")] }))).toEqual(["Removed “c” from Work › General › Reading › Inbox"])
  })

  it("names a whole new or removed container once, with its tab count", () => {
    const before = tree({ g: [tab("a")] })
    const after = tree({ g: [tab("a")], Later: [tab("x"), tab("y")] })
    expect(texts(before, after)).toEqual(["Added group “Later” in Work › General › Reading (2 tabs)"])
    expect(texts(after, before)).toEqual(["Removed group “Later” from Work › General › Reading (2 tabs)"])
    expect(texts([], before)).toEqual(["Added space “Work” (1 tab)"])
    expect(texts(before, [])).toEqual(["Removed space “Work” (1 tab)"])
  })

  it("reports renames, address edits and moves between groups", () => {
    const before = tree({ g: [tab("a"), tab("b")], Later: [] })
    const after = clone(before)
    after[0].name = "Office"
    const groups = after[0].projects[0].categories[0].groups
    groups[0].tabs[0] = tab("a", "a", "https://new.example/")
    groups[1].tabs.push(groups[0].tabs.splice(1, 1)[0])
    expect(texts(before, after)).toEqual([
      "Renamed space “Work” to “Office”",
      "Changed tab “a” in Office › General › Reading › Inbox",
      "Moved “b” from Work › General › Reading › Inbox to Office › General › Reading › Later",
    ])
    expect(texts(before, clone(before))).toEqual([])
  })
})

describe("diffTrees: colours and short names", () => {
  const inbox = (t: SavedSpace[]) => t[0].projects[0].categories[0].groups[0]

  it("says a group's colour changed, by its menu name, or that it was removed", () => {
    const before = tree({ g: [tab("a")] })
    const red = clone(before); inbox(red).color = "red"
    expect(texts(before, red)).toEqual(["Changed the color of group “Inbox” to Red in Work › General › Reading"])
    const green = clone(red); inbox(green).color = "green"
    expect(texts(red, green)).toEqual(["Changed the color of group “Inbox” to Green in Work › General › Reading"])
    expect(texts(red, before)).toEqual(["Removed the color of group “Inbox” in Work › General › Reading"])
  })

  it("says a space's colour and short name changed", () => {
    const before = tree({ g: [tab("a")] })
    const styled = clone(before); styled[0].color = "#22c55e"; styled[0].abbreviation = "WK"
    expect(texts(before, styled)).toEqual([
      "Changed the color of space “Work”", // a swatch: no name to give
      "Changed the short name of space “Work” to “WK”",
    ])
    expect(texts(styled, before)).toEqual(["Removed the color of space “Work”", "Removed the short name of space “Work”"])
  })

  it("lists a rename and a recolour of one group as two changes", () => {
    const before = tree({ g: [tab("a")] })
    const after = clone(before); inbox(after).name = "Queue"; inbox(after).color = "blue"
    expect(texts(before, after)).toEqual([
      "Renamed group “Inbox” to “Queue” in Work › General › Reading",
      "Changed the color of group “Queue” to Blue in Work › General › Reading",
    ])
  })

  it("treats missing, null and empty as the same unset value", () => {
    const before = tree({ g: [tab("a")] })
    const empty = clone(before); empty[0].color = ""; (empty[0] as { abbreviation?: unknown }).abbreviation = null
    ;(inbox(empty) as { color?: unknown }).color = ""
    expect(texts(before, empty)).toEqual([])
  })

  it("summarises a style edit on the item itself and inside it", () => {
    const space = tree({ g: [tab("a")] })[0]
    const group = space.projects[0].categories[0].groups[0]
    expect(editSummary(group as never, { ...clone(group), color: "red" } as never, "group")).toBe("changed its color to Red")
    const coloured = clone(space); coloured.projects[0].categories[0].groups[0].color = "red"
    expect(editSummary(coloured as never, space as never, "space")).toBe("removed the color of group “Inbox”")
    expect(editSummary(space as never, { ...clone(space), abbreviation: "WK" } as never, "space")).toBe("changed its short name to “WK”")
    expect(editSummary(space as never, { ...clone(space), color: "#ef4444" } as never, "space")).toBe("changed its color")
  })

  it("shows a one-sided recolour as merged automatically, and a two-sided one only as a conflict", () => {
    const base = tree({ g: [tab("a")], Later: [tab("b")] })
    const server = clone(base), local = clone(base)
    server[0].projects[0].categories[0].groups[0].color = "red" // only the account
    server[0].projects[0].categories[0].groups[1].color = "cyan" // both, differently
    local[0].projects[0].categories[0].groups[1].color = "pink"
    const { conflicts } = merge3(base, server, local)
    expect(conflicts.map((c) => `${c.name}:${c.field}`)).toEqual(["Later:color"])
    const { fromAccount, fromDevice } = autoMerged(base, server, local, conflicts)
    expect(fromAccount.map(changeText)).toEqual(["Changed the color of group “Inbox” to Red in Work › General › Reading"])
    expect(fromDevice.map(changeText)).toEqual([])
  })
})

describe("autoMerged", () => {
  it("lists what each side brings, leaving the conflicts out", () => {
    const base = tree({ g: [tab("a"), tab("b")] })
    const server = clone(base); server[0].name = "Office"; server[0].projects[0].categories[0].groups[0].tabs.push(tab("s1"), tab("s2"))
    const local = clone(base); local[0].name = "Work HQ"; local[0].projects[0].categories[0].groups[0].tabs.splice(1, 1)
    const { conflicts } = merge3(base, server, local)
    expect(conflicts.map((c) => c.field)).toEqual(["name"])
    const { fromAccount, fromDevice } = autoMerged(base, server, local, conflicts)
    // Places read as at the base ("Work"), whatever each side renamed the space to.
    expect(fromAccount.map(changeText)).toEqual(["Added 2 tabs in Work › General › Reading › Inbox"])
    expect(fromDevice.map(changeText)).toEqual(["Removed “b” from Work › General › Reading › Inbox"])
  })

  it("never changes what merge3 decides", () => {
    const base = tree({ g: [tab("a")] })
    const server = clone(base); server[0].name = "Office"
    const local = clone(base); local[0].name = "Home"
    const before = JSON.stringify(merge3(base, server, local))
    autoMerged(base, server, local, merge3(base, server, local).conflicts)
    expect(JSON.stringify(merge3(base, server, local))).toBe(before)
  })
})

describe("locate / editSummary", () => {
  it("finds a node's level and path in the first tree that has it", () => {
    const t = tree({ g: [tab("a")] })
    expect(locate("g", null, t)).toMatchObject({ level: "group", path: ["Work", "General", "Reading"] })
    expect(locate("a", t)?.level).toBe("tab")
    expect(locate("nope", t)).toBeUndefined()
    expect(indexTree(null).size).toBe(0)
  })

  it("says what one side did to an item since the base", () => {
    const base = tree({ g: [tab("a")] })[0].projects[0].categories[0].groups[0]
    const edited = { ...clone(base), name: "Queue", tabs: [tab("a"), tab("n1"), tab("n2")] }
    expect(editSummary(base as never, edited as never, "group")).toBe("renamed it to “Queue”, added 2 tabs")
    expect(editSummary(tab("a") as never, tab("a", "a", "https://moved.example/") as never, "tab")).toBe("changed its address")
    const space = tree({ g: [tab("a")] })[0]
    const renamedInside = clone(space); renamedInside.projects[0].categories[0].name = "Papers"
    renamedInside.projects[0].categories[0].groups[0].tabs[0] = tab("a", "a", "https://moved.example/")
    expect(editSummary(space as never, renamedInside as never, "space")).toBe("renamed category “Reading” to “Papers”, changed the address of “a”")
    expect(editSummary(undefined, edited as never, "group")).toBe("changed it")
    expect(editSummary(base as never, clone(base) as never, "group")).toBe("changed it")
  })
})

describe("syncChanges edge cases", () => {
  it("tolerates malformed nodes and unnamed items", () => {
    const messy = [null, { name: "no id" }, { id: "s", name: "", projects: undefined },
      { id: "s2", name: "Two", projects: [{ id: "p", name: "P", categories: [{ id: "c", name: "C", groups: [{ id: "g", name: "G", tabs: [{ id: "t", title: "", url: "https://only-url.example/" }] }] }] }] }] as unknown as SavedSpace[]
    const index = indexTree(messy)
    expect(index.size).toBe(6)
    expect(locate("s", messy)?.path).toEqual([])
    expect(texts([], messy)).toEqual(["Added space “(untitled)” (0 tabs)", "Added space “Two” (1 tab)"])
    expect(texts(messy, [])).toEqual(["Removed space “(untitled)” (0 tabs)", "Removed space “Two” (1 tab)"])
    expect(locate("t", messy) && changeText({ kind: "added", level: "tab", count: 1, name: "https://only-url.example/", path: ["Two"] })).toBe("Added “https://only-url.example/” in Two")
  })

  it("names places by the base, falling back to the new name for places the base lacks", () => {
    const base = tree({ g: [tab("a")] })
    const to = clone(base); to[0].name = "Renamed"
    to[0].projects.push({ id: "p2", name: "New project", categories: [{ id: "c2", name: "New cat", groups: [{ id: "g2", name: "New group", tabs: [] }] }] })
    const from = clone(to)
    from[0].projects[1].categories[0].groups[0].tabs.push(tab("m1"), tab("m2"))
    to[0].projects[0].categories[0].groups[0].tabs.push(tab("m1"), tab("m2"))
    expect(diffTrees(from, to, base).map(changeText)).toEqual([
      "Moved 2 tabs from Work › New project › New cat › New group to Work › General › Reading › Inbox",
    ])
  })

  it("summarises removed, moved and nested edits of one item", () => {
    const space = tree({ g: [tab("a"), tab("b"), tab("c")], Later: [tab("d")] })[0]
    const edited = clone(space)
    const [inbox, later] = edited.projects[0].categories[0].groups
    inbox.tabs.splice(0, 1) // removed a
    later.tabs.push(inbox.tabs.splice(0, 1)[0]) // moved b
    later.tabs[0].title = "d renamed"
    edited.projects[0].categories[0].groups.push({ id: "g3", name: "Fresh", tabs: [] })
    expect(editSummary(space as never, edited as never, "space"))
      .toBe("renamed tab “d” to “d renamed”, moved 1 tab, added group “Fresh”, removed 1 tab")
  })
})

describe("container moves (TASK-59)", () => {
  const spaces = (where: "Hobby" | "Personal"): SavedSpace[] => [
    { id: "h", name: "Hobby", projects: where === "Hobby" ? [{ id: "p", name: "Test", categories: [] }] : [] },
    { id: "e", name: "Personal", projects: where === "Personal" ? [{ id: "p", name: "Test", categories: [] }] : [] },
  ]

  it("reports a project moved to another space as one line", () => {
    expect(texts(spaces("Hobby"), spaces("Personal"))).toEqual(["Moved project “Test” from Hobby to Personal"])
  })

  it("lists a move made on this device as going to the account", () => {
    const base = spaces("Hobby")
    const { conflicts } = merge3(base, base, spaces("Personal"))
    const { fromAccount, fromDevice } = autoMerged(base, base, spaces("Personal"), conflicts)
    expect(fromAccount.map(changeText)).toEqual([])
    expect(fromDevice.map(changeText)).toEqual(["Moved project “Test” from Hobby to Personal"])
  })
})
