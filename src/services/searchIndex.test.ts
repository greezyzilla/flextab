import { describe, expect, it } from "vitest"
import type { SavedSpace } from "~src/types"
import { rank, searchAll } from "./searchIndex"

const tab = (id: string, title: string, url = `https://${id}.example/`) => ({ id, title, url, favicon: "" })
const spaces: SavedSpace[] = [
  { id: "s1", name: "Work", projects: [
    { id: "p1", name: "General", categories: [{ id: "c1", name: "Uncategorized", groups: [
      { id: "g1", name: "Inbox", tabs: [tab("t1", "React docs", "https://react.dev/"), tab("t2", "Preact", "https://preactjs.com/")] },
    ] }] },
    { id: "p2", name: "Clients", categories: [{ id: "c2", name: "Acme", groups: [
      { id: "g2", name: "Reading", tabs: [tab("t3", "Linear board", "https://linear.app/react")] },
    ] }] },
  ] },
  { id: "s2", name: "Reactive home", projects: [] },
]

describe("rank", () => {
  it("puts title starts first, then word starts, anywhere in the title, then the address", () => {
    expect(rank("react", "React docs")).toBe(0)
    expect(rank("docs", "React docs")).toBe(1)
    expect(rank("eact", "Preact")).toBe(2)
    expect(rank("linear", "Board", "https://linear.app")).toBe(3)
    expect(rank("zzz", "Board", "https://linear.app")).toBeNull()
  })
})

describe("searchAll", () => {
  it("finds saved tabs ranked, with short paths that drop the default names", () => {
    const { saved } = searchAll("react", spaces)
    expect(saved.map((h) => h.tab.title)).toEqual(["React docs", "Preact", "Linear board"])
    expect(saved[0].path).toEqual(["Work", "Inbox"]) // not Work / General / Uncategorized / Inbox
    expect(saved[2].path).toEqual(["Work", "Clients", "Acme", "Reading"])
  })

  it("finds places at every level with their parents", () => {
    const { places } = searchAll("rea", spaces)
    // Equal ranks keep workspace order.
    expect(places.map((p) => [p.level, p.name, p.path])).toEqual([
      ["group", "Reading", ["Work", "Clients", "Acme"]],
      ["space", "Reactive home", []],
    ])
    expect(searchAll("general", spaces).places.map((p) => p.level)).toEqual(["project"])
  })

  it("shows an open page once: as saved with Open when it is saved, else under open tabs", () => {
    const open = [
      { id: 1, windowId: 10, title: "React docs", url: "https://react.dev/" },
      { id: 2, windowId: 11, title: "React blog", url: "https://react.dev/blog" },
      { id: 3, windowId: 10, title: "React settings", url: "chrome://settings" },
      { windowId: 10, title: "React no id", url: "https://x.example/" },
    ]
    const { saved, open: openHits } = searchAll("react", spaces, open)
    expect(saved[0].isOpen).toBe(true)
    expect(saved[1].isOpen).toBe(false)
    expect(openHits.map((h) => [h.title, h.windowLabel])).toEqual([["React blog", "Window 2"]])
    expect(searchAll("react", spaces, [{ id: 9, windowId: 1, url: "https://reactnative.dev/" }]).open[0]).toMatchObject({ title: "https://reactnative.dev/", windowLabel: "" })
  })

  it("returns nothing for an empty query", () => {
    expect(searchAll("  ", spaces)).toEqual({ open: [], saved: [], places: [] })
  })
})
