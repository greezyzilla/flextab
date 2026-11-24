import { describe, expect, it } from "vitest"
import type { SavedSpace } from "~src/types"
import { addAccountCopies, canKeepBoth } from "./keepBoth"
import { merge3, type Conflict } from "./spacesMerge3"

const space = (tabs: { id: string; url: string; title?: string }[]): SavedSpace[] => [{ id: "s", name: "Work", projects: [{ id: "p", name: "P",
  categories: [{ id: "c", name: "C", groups: [{ id: "g", name: "G", tabs: tabs.map((t, order) => ({ favicon: "", title: t.id, ...t, order })) }] }] }] }]
const tabsOf = (t: SavedSpace[]) => t[0].projects[0].categories[0].groups[0].tabs

describe("keepBoth (TASK-29)", () => {
  it("offers both only for a tab's address", () => {
    expect(canKeepBoth({ kind: "field", field: "url" } as Conflict, "tab")).toBe(true)
    expect(canKeepBoth({ kind: "field", field: "title" } as Conflict, "tab")).toBe(false)
    expect(canKeepBoth({ kind: "field", field: "name" } as Conflict, "group")).toBe(false)
    expect(canKeepBoth({ kind: "delete-edit" } as Conflict, "tab")).toBe(false)
  })

  it("adds the account's tab right after this device's, with a new id, and leaves the input alone", () => {
    const base = space([{ id: "a", url: "https://x/1" }, { id: "b", url: "https://x/b" }])
    const server = space([{ id: "a", url: "https://x/88", title: "PR 88" }, { id: "b", url: "https://x/b" }])
    const local = space([{ id: "a", url: "https://x/91" }, { id: "b", url: "https://x/b" }])
    const { merged, conflicts } = merge3(base, server, local, {})
    const before = JSON.stringify(merged)
    const out = addAccountCopies(merged, server, conflicts, () => "new-id")
    expect(tabsOf(out).map((t) => [t.id, t.url, t.order])).toEqual([["a", "https://x/91", 0], ["new-id", "https://x/88", 1], ["b", "https://x/b", 2]])
    expect(tabsOf(out)[1].title).toBe("PR 88")
    expect(JSON.stringify(merged)).toBe(before)
    // The next merge sees no conflict: the copy is a new tab, the original is this device's.
    expect(merge3(out, out, out).conflicts).toEqual([])
  })

  it("does nothing without conflicts or when the account no longer has the tab", () => {
    const t = space([{ id: "a", url: "https://x/1" }])
    expect(addAccountCopies(t, t, [])).toBe(t)
    expect(tabsOf(addAccountCopies(t, space([]), [{ id: "a" } as Conflict]))).toHaveLength(1)
  })
})
