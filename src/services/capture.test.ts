import { beforeEach, describe, expect, it, vi } from "vitest"
import * as yjs from "~src/lib/yjsDoc"
import type { ClosedTab } from "./capture"
import type { SavedSpace } from "~src/types"
import {
  captureTabs, undoCapture, moveCapture, closeSavedTabs, recordClosed, reopenTabs, defaultDestination, suggestDestination,
  loadDefaultDestination, isCaptureFailure, loadCloseAfterSave, saveCloseAfterSave, loadCloseAfter, saveCloseAfter,
  storeLastCapture, loadLastCapture, syncDocFromStorage, resetWorkerHydration, windowGroupName,
  type CaptureReceipt,
} from "./capture"

vi.mock("~src/utils/favicon", () => ({ faviconToDataUrl: vi.fn(async (u: string) => u) }))

const tree = (): SavedSpace[] => [{
  id: "s", name: "Work", order: 0,
  projects: [{ id: "p", name: "Site", order: 0, categories: [
    { id: "c", name: "Research", order: 0, groups: [
      { id: "g", name: "Reading", order: 0, tabs: [{ id: "t0", url: "https://a.com/", title: "A", favicon: "", order: 0 }] },
    ] },
    { id: "c2", name: "Design", order: 1, groups: [] },
  ] }],
}]

let disk: Record<string, unknown>
const groupsOf = (categoryId: string) => yjs.getSpaces()[0].projects[0].categories.find(c => c.id === categoryId)!.groups
const receipt = (r: Awaited<ReturnType<typeof captureTabs>>) => {
  if (isCaptureFailure(r)) throw new Error(r.error)
  return r
}

beforeEach(async () => {
  vi.clearAllMocks()
  disk = {}
  vi.mocked(chrome.storage.local.get).mockImplementation((async (key: string) => (key in disk ? { [key]: disk[key] } : {})) as never)
  vi.mocked(chrome.storage.local.set).mockImplementation((async (items: Record<string, unknown>) => { Object.assign(disk, structuredClone(items)) }) as never)
  vi.mocked(chrome.storage.local.remove).mockImplementation((async (key: string) => { delete disk[key] }) as never)
  await yjs.clearState()
  yjs.setSpaces(tree())
})

describe("captureTabs", () => {
  it("appends into an existing group, skipping unsavable pages, and persists", async () => {
    const r = receipt(await captureTabs(
      [{ url: "https://b.com", title: "B" }, { url: "chrome://settings" }],
      { spaceId: "s", projectId: "p", categoryId: "c", groupId: "g" },
    ))
    expect(r).toMatchObject({ createdGroup: false, skipped: 1, duplicates: 0, target: { groupId: "g" } })
    const tabs = groupsOf("c")[0].tabs
    expect(tabs.map(t => [t.url, t.order])).toEqual([["https://a.com/", 0], ["https://b.com", 1]])
    expect(yjs.decodeSpacesFromStorage(disk[yjs.PERSIST_KEY])[0].projects[0].categories[0].groups[0].tabs).toHaveLength(2)
    await vi.waitFor(() => expect(disk.flextab_recent_destinations).toEqual([{ spaceId: "s", projectId: "p", categoryId: "c", groupId: "g" }]))
  })

  it("dedupes URLs already in the group (trailing slash ignored)", async () => {
    const r = receipt(await captureTabs([{ url: "https://a.com" }], { spaceId: "s", projectId: "p", categoryId: "c", groupId: "g" }, { dedupe: true }))
    expect(r).toMatchObject({ tabIds: [], duplicates: 1 })
    expect(groupsOf("c")[0].tabs).toHaveLength(1)
  })

  it("reports where a saved URL already exists elsewhere, without blocking the save", async () => {
    const r = receipt(await captureTabs([{ url: "https://A.com" }], { spaceId: "s", projectId: "p", categoryId: "c2", newGroupName: "Again" }))
    expect(r.tabIds).toHaveLength(1)
    expect(r.alsoIn).toEqual(["Work › Site › Research › Reading"])
    const fresh = receipt(await captureTabs([{ url: "https://new.com" }], { spaceId: "s", projectId: "p", categoryId: "c", groupId: "g" }))
    expect(fresh.alsoIn).toEqual([])
  })

  it("creates a named group, and falls back to Unsorted when the group is gone", async () => {
    const r = receipt(await captureTabs([{ url: "https://b.com" }], { spaceId: "s", projectId: "p", categoryId: "c2", newGroupName: "Moodboard" }))
    expect(r.createdGroup).toBe(true)
    expect(groupsOf("c2")).toMatchObject([{ id: r.target.groupId, name: "Moodboard" }])
    const unnamed = receipt(await captureTabs([{ url: "https://c.com" }], { spaceId: "s", projectId: "p", categoryId: "c2", groupId: "gone" }))
    expect(groupsOf("c2").find(g => g.id === unnamed.target.groupId)).toMatchObject({ name: "Unsorted", config: { kind: "unsorted" } })
  })

  it("saves into the category's Unsorted when no group is chosen, reusing it", async () => {
    const a = receipt(await captureTabs([{ url: "https://b.com" }], { spaceId: "s", projectId: "p", categoryId: "c" }))
    const b = receipt(await captureTabs([{ url: "https://c.com" }], { spaceId: "s", projectId: "p", categoryId: "c" }))
    expect(a.createdGroup).toBe(true)
    expect(b).toMatchObject({ createdGroup: false, target: { groupId: a.target.groupId } })
    expect(groupsOf("c").filter(g => g.config?.kind === "unsorted").map(g => g.tabs.length)).toEqual([2])
    expect(groupsOf("c").find(g => g.id === "g")!.tabs).toHaveLength(1)
  })

  it("creates the default path inside a space that has no projects", async () => {
    yjs.setSpaces([...tree(), { id: "e", name: "Empty", order: 1, projects: [] }])
    const r = receipt(await captureTabs([{ url: "https://b.com" }], { spaceId: "e", projectId: "", categoryId: "" }))
    const [project] = yjs.getSpaces().find(s => s.id === "e")!.projects
    expect(r.target).toMatchObject({ spaceId: "e", projectId: project.id, categoryId: project.categories[0].id })
    expect([project.name, project.categories[0].name, project.categories[0].groups[0].name]).toEqual(["General", "Uncategorized", "Unsorted"])
  })

  it("creates a Personal space when the workspace has none, and reuses it", async () => {
    yjs.setSpaces([])
    const first = receipt(await captureTabs([{ url: "https://b.com" }], { spaceId: "", projectId: "", categoryId: "" }))
    const second = receipt(await captureTabs([{ url: "https://c.com" }], { spaceId: "", projectId: "", categoryId: "" }))
    const spaces = yjs.getSpaces()
    expect(spaces.map(s => s.name)).toEqual(["Personal"])
    expect(first.target).toEqual(second.target)
    expect(spaces[0].projects[0].categories[0].groups[0].tabs.map(t => t.url)).toEqual(["https://b.com", "https://c.com"])
  })

  it("reports a refused storage write so the caller can retry", async () => {
    vi.mocked(chrome.storage.local.set).mockImplementation((async (items: Record<string, unknown>) => {
      if (yjs.PERSIST_KEY in items) throw new Error("quota")
      Object.assign(disk, items)
    }) as never)
    const r = receipt(await captureTabs([{ url: "https://b.com" }], { spaceId: "s", projectId: "p", categoryId: "c", groupId: "g" }))
    expect(r.persisted).toBe(false)
    expect(groupsOf("c")[0].tabs).toHaveLength(2)
  })

  it("fails without writing when nothing is savable or the space is gone", async () => {
    expect(await captureTabs([{ url: "about:blank" }], { spaceId: "s", projectId: "p", categoryId: "c" })).toEqual({ error: "nothing-savable", skipped: 1 })
    expect(await captureTabs([{ url: "https://b.com" }], { spaceId: "nope", projectId: "p", categoryId: "c" })).toEqual({ error: "no-destination", skipped: 0 })
    expect(disk[yjs.PERSIST_KEY]).toBeUndefined()
  })
})

describe("undo and change", () => {
  it("undo removes only this capture's tabs and reopens closed tabs", async () => {
    const r = receipt(await captureTabs([{ url: "https://b.com" }], { spaceId: "s", projectId: "p", categoryId: "c", groupId: "g" }))
    await undoCapture({ ...r, closed: [{ windowId: 1, index: 2, url: "https://b.com" }] })
    expect(groupsOf("c")[0].tabs.map(t => t.url)).toEqual(["https://a.com/"])
    expect(chrome.tabs.create).toHaveBeenCalledWith({ windowId: 1, index: 2, url: "https://b.com", active: false })
  })

  it("undo reopens the closed tab even when saving the removal fails", async () => {
    const r = await captureTabs([{ url: "https://q.com", title: "Q" }], { spaceId: "s", projectId: "p", categoryId: "c" })
    if (isCaptureFailure(r)) throw new Error("capture failed")
    // Only the workspace write fails; other writes (the store's own) go through.
    const set = vi.mocked(chrome.storage.local.set).getMockImplementation() as unknown as (items: Record<string, unknown>) => Promise<void>
    vi.mocked(chrome.storage.local.set).mockImplementation((async (items: Record<string, unknown>) => {
      if (yjs.PERSIST_KEY in items) throw new Error("QUOTA_BYTES quota exceeded")
      return set(items)
    }) as never)
    await expect(undoCapture({ ...r, closed: [{ windowId: 1, index: 4, url: "https://q.com" }] })).rejects.toThrow(/quota/)
    // The tab is back although the write failed, and the failure still surfaces.
    expect(chrome.tabs.create).toHaveBeenCalledWith({ windowId: 1, index: 4, url: "https://q.com", active: false })
  })

  it("undo also removes a group the capture created", async () => {
    const r = receipt(await captureTabs([{ url: "https://b.com" }], { spaceId: "s", projectId: "p", categoryId: "c2" }))
    await undoCapture(r)
    expect(groupsOf("c2")).toEqual([])
    await undoCapture({ ...r, target: { ...r.target, groupId: "missing" } }) // no-op
  })

  it("change moves the tabs to another destination and keeps counts", async () => {
    const r = receipt(await captureTabs([{ url: "https://b.com" }, { url: "about:blank" }], { spaceId: "s", projectId: "p", categoryId: "c2" }))
    const moved = receipt(await moveCapture(r, { spaceId: "s", projectId: "p", categoryId: "c", groupId: "g" }))
    expect(groupsOf("c2")).toEqual([])
    expect(groupsOf("c")[0].tabs.map(t => t.url)).toEqual(["https://a.com/", "https://b.com"])
    expect(moved).toMatchObject({ skipped: 1, target: { categoryId: "c", groupId: "g" } })
    // Nothing left to move (already undone elsewhere) → reported, not invented.
    expect(await moveCapture({ ...moved, tabIds: ["gone"] }, { spaceId: "s", projectId: "p", categoryId: "c2" })).toEqual({ error: "nothing-savable", skipped: 0 })
    expect(await moveCapture(moved, { spaceId: "nope", projectId: "p", categoryId: "c" })).toEqual({ error: "no-destination", skipped: 0 })
  })
})

describe("closing and reopening tabs", () => {
  it("closes saved tabs but never pinned or unsavable ones, keeping the window open", async () => {
    vi.mocked(chrome.tabs.query).mockResolvedValue([{ id: 1 }, { id: 2 }] as chrome.tabs.Tab[])
    const closed = await closeSavedTabs([
      { id: 1, url: "https://a.com", windowId: 7, index: 0 },
      { id: 2, url: "https://b.com", windowId: 7, index: 1 },
      { id: 3, url: "https://c.com", windowId: 7, index: 2, pinned: true },
      { id: 4, url: "chrome-extension://x/newtab.html", windowId: 7, index: 3 },
    ])
    expect(chrome.tabs.create).toHaveBeenCalledWith({ windowId: 7, active: true })
    expect(chrome.tabs.remove).toHaveBeenCalledWith([1, 2])
    expect(closed).toEqual([expect.objectContaining({ windowId: 7, index: 0, url: "https://a.com" }), expect.objectContaining({ windowId: 7, index: 1, url: "https://b.com" })])
    expect(await closeSavedTabs([{ id: 5, url: "about:blank" }])).toEqual([])
  })

  it("closes tabs with no window info without opening a placeholder tab", async () => {
    expect(await closeSavedTabs([{ id: 6, url: "https://d.com" }])).toEqual([expect.objectContaining({ windowId: -1, index: 0, url: "https://d.com" })])
    expect(chrome.tabs.query).not.toHaveBeenCalled()
  })

  it("reopens in a new window when the original window is gone", async () => {
    vi.mocked(chrome.tabs.create).mockRejectedValueOnce(new Error("No window"))
    await reopenTabs([{ windowId: 9, index: 0, url: "https://a.com" }])
    expect(chrome.windows.create).toHaveBeenCalledWith({ url: ["https://a.com"] })
    await reopenTabs([])
  })

  // A window emptied by closing its tabs one by one is gone for every Undo.
  const windowsAlive = (alive: number[]) =>
    vi.mocked(chrome.tabs.create).mockImplementation((async (p: chrome.tabs.CreateProperties) => {
      if (p.windowId !== undefined && !alive.includes(p.windowId)) throw new Error("No window")
      return { id: 1 } as chrome.tabs.Tab
    }) as never)

  it.each([["the last closed", "b"], ["the first closed", "a"]])("brings both tabs back in one window, in their order, when %s is undone first", async (_, firstUndo) => {
    const win = firstUndo === "b" ? 21 : 22
    // A then B, each at index 0 when it closed (B moved left once A was gone); the window closed with B.
    const a = recordClosed({ windowId: win, index: 0, url: "https://a.com" })
    const b = recordClosed({ windowId: win, index: 0, url: "https://b.com" })
    const alive: number[] = []
    windowsAlive(alive)
    vi.mocked(chrome.windows.create).mockImplementation((async () => { alive.push(900 + win); return { id: 900 + win } }) as never)
    const [first, second] = firstUndo === "b" ? [b, a] : [a, b]
    await reopenTabs([first])
    await reopenTabs([second])
    // One new window, then the second tab joins it on the side that keeps A before B.
    expect(chrome.windows.create).toHaveBeenCalledTimes(1)
    expect(chrome.windows.create).toHaveBeenCalledWith({ url: [first.url] })
    expect(chrome.tabs.create).toHaveBeenLastCalledWith({ windowId: 900 + win, index: firstUndo === "b" ? 0 : 1, url: second.url, active: false })
  })

  it("opens a new window again when the one an earlier Undo opened was closed too", async () => {
    windowsAlive([])
    vi.mocked(chrome.windows.create).mockResolvedValueOnce({ id: 601 } as never).mockResolvedValueOnce({ id: 602 } as never)
    await reopenTabs([recordClosed({ windowId: 23, index: 0, url: "https://a.com" })])
    await reopenTabs([recordClosed({ windowId: 23, index: 0, url: "https://b.com" })])
    expect(chrome.windows.create).toHaveBeenCalledTimes(2)
  })

  it("reopens a batch closed together in its order (Close after saving)", async () => {
    windowsAlive([])
    vi.mocked(chrome.windows.create).mockResolvedValueOnce({ id: 603 } as never)
    vi.mocked(chrome.tabs.query).mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }] as chrome.tabs.Tab[])
    const closed = await closeSavedTabs([
      { id: 1, url: "https://a.com", windowId: 25, index: 0 },
      { id: 2, url: "https://b.com", windowId: 25, index: 1 },
    ])
    await reopenTabs(closed)
    expect(chrome.windows.create).toHaveBeenCalledWith({ url: ["https://a.com", "https://b.com"] })
  })

  // [A, B, D] stays open; A and B close in some order and come back in some order.
  it.each([
    ["A then B", "A then B"], ["A then B", "B then A"], ["B then A", "A then B"], ["B then A", "B then A"],
  ])("puts tabs back in their places in a window that still exists (closed %s, undone %s)", async (closeOrder, undoOrder) => {
    const win = 40 + ["A then B", "B then A"].indexOf(closeOrder) * 2 + ["A then B", "B then A"].indexOf(undoOrder)
    windowsAlive([win])
    const tabs = ["A", "B", "D"]
    const close = (name: string) => { const i = tabs.indexOf(name); tabs.splice(i, 1); return recordClosed({ windowId: win, index: i, url: `https://${name}.com` }) }
    const closed: Record<string, ClosedTab> = {}
    for (const n of closeOrder.split(" then ")) closed[n] = close(n)
    for (const n of undoOrder.split(" then ")) {
      vi.mocked(chrome.tabs.create).mockClear()
      await reopenTabs([closed[n]])
      const index = vi.mocked(chrome.tabs.create).mock.calls[0][0].index!
      tabs.splice(index, 0, n)
    }
    expect(tabs).toEqual(["A", "B", "D"])
  })

  it("keeps the recorded index for a close its window's log does not know", async () => {
    windowsAlive([50])
    recordClosed({ windowId: 50, index: 0, url: "https://logged.com" })
    await reopenTabs([{ windowId: 50, index: 3, url: "https://other.com", seq: 999_999 }])
    expect(chrome.tabs.create).toHaveBeenCalledWith({ windowId: 50, index: 3, url: "https://other.com", active: false })
    windowsAlive([])
    vi.mocked(chrome.windows.create).mockResolvedValueOnce({ id: 604 } as never)
    await reopenTabs([{ windowId: 50, index: 3, url: "https://other.com", seq: 999_998 }])
    expect(chrome.windows.create).toHaveBeenCalledWith({ url: ["https://other.com"] })
  })

  it("logs a batch of tabs that carry no index", async () => {
    vi.mocked(chrome.tabs.query).mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }] as chrome.tabs.Tab[])
    const closed = await closeSavedTabs([{ id: 1, url: "https://x.com", windowId: 51 }, { id: 2, url: "https://y.com", windowId: 51 }])
    expect(closed.map((c) => c.index)).toEqual([0, 0])
    expect(closed.every((c) => typeof c.seq === "number")).toBe(true)
  })

  it("keeps a tab whose window still exists in that window, untouched", async () => {
    windowsAlive([24])
    await reopenTabs([{ windowId: 24, index: 2, url: "https://c.com" }])
    expect(chrome.tabs.create).toHaveBeenCalledWith({ windowId: 24, index: 2, url: "https://c.com", active: false })
    expect(chrome.windows.create).not.toHaveBeenCalled()
  })
})

describe("defaults and settings", () => {
  it("picks the last group, else that category's Unsorted, else the first category's Unsorted", () => {
    const spaces = yjs.getSpaces()
    expect(defaultDestination(spaces, [{ spaceId: "s", projectId: "p", categoryId: "c", groupId: "g" }])).toMatchObject({ categoryId: "c", groupId: "g" })
    expect(defaultDestination(spaces, [{ spaceId: "s", projectId: "p", categoryId: "c2", groupId: "gone" }])).toEqual({ spaceId: "s", projectId: "p", categoryId: "c2", groupId: undefined })
    expect(defaultDestination(spaces, [{ spaceId: "x", projectId: "p", categoryId: "c" }])).toEqual({ spaceId: "s", projectId: "p", categoryId: "c", groupId: undefined })
    // No space at all: empty ids, and the save itself creates the space.
    expect(defaultDestination([], [])).toEqual({ spaceId: "", projectId: "", categoryId: "", groupId: undefined })
  })

  // The "suddenly saved to Unsorted" report. Before, the newest
  // recent whose category still existed won, even when its group was gone or
  // had moved, so the save went to that category's Unsorted.
  it("follows a moved group, and skips a deleted one for an older recent whose group still exists", () => {
    const spaces = yjs.getSpaces()
    // g lives in c; the recent still says c2 (it was moved after the save).
    expect(defaultDestination(spaces, [{ spaceId: "s", projectId: "p", categoryId: "c2", groupId: "g" }])).toEqual({ spaceId: "s", projectId: "p", categoryId: "c", groupId: "g" })
    // Newest recent's group was deleted: the older one with a live group wins over c2's Unsorted.
    expect(defaultDestination(spaces, [
      { spaceId: "s", projectId: "p", categoryId: "c2", groupId: "gone" },
      { spaceId: "s", projectId: "p", categoryId: "c", groupId: "g" },
    ])).toEqual({ spaceId: "s", projectId: "p", categoryId: "c", groupId: "g" })
  })

  it("says why a destination was suggested, so the popup can name it", () => {
    const spaces = yjs.getSpaces()
    const from = (recent: Parameters<typeof suggestDestination>[1], preferred = {}) => suggestDestination(spaces, recent, preferred).from
    expect(from([{ spaceId: "s", projectId: "p", categoryId: "c", groupId: "g" }])).toBe("recentGroup")
    expect(from([{ spaceId: "s", projectId: "p", categoryId: "c2", groupId: "gone" }])).toBe("recentCategory")
    expect(from([], { spaceId: "s", projectId: "p", categoryId: "c2" })).toBe("current")
    expect(from([], { spaceId: "s", projectId: "p", categoryId: "gone" })).toBe("first")
    expect(from([])).toBe("first")
  })

  it("loads the default from stored recents", async () => {
    disk.flextab_recent_destinations = [{ spaceId: "s", projectId: "p", categoryId: "c2" }]
    expect(await loadDefaultDestination()).toMatchObject({ categoryId: "c2" })
  })

  it("remembers 'close after saving' and the last capture per device", async () => {
    expect(await loadCloseAfterSave()).toBe(false)
    await saveCloseAfterSave(true)
    expect(await loadCloseAfterSave()).toBe(true)
    const r = { at: Date.now() } as CaptureReceipt
    await storeLastCapture(r)
    expect(await loadLastCapture()).toEqual(r)
    expect(await loadLastCapture(-1)).toBeNull()
    await storeLastCapture(null)
    expect(await loadLastCapture()).toBeNull()
    expect(windowGroupName()).toMatch(/^Window /)
  })

  it("keeps one 'close after saving' switch per way of saving, off until set", async () => {
    for (const kind of ["drag", "window", "saveAll", "popup"] as const) expect(await loadCloseAfter(kind)).toBe(false)
    // The window shortcut used to follow Save all's switch: kept until set on its own.
    await saveCloseAfterSave(true)
    expect(await loadCloseAfter("saveAll")).toBe(true)
    expect(await loadCloseAfter("window")).toBe(true)
    await saveCloseAfter("window", false)
    expect(await loadCloseAfter("window")).toBe(false)
    await saveCloseAfter("drag", true)
    await saveCloseAfter("popup", true)
    expect([await loadCloseAfter("drag"), await loadCloseAfter("popup"), await loadCloseAfter("saveAll")]).toEqual([true, true, true])
  })

  it("survives storage failures", async () => {
    vi.mocked(chrome.storage.local.get).mockRejectedValue(new Error("x"))
    vi.mocked(chrome.storage.local.set).mockRejectedValue(new Error("x"))
    vi.mocked(chrome.storage.local.remove).mockRejectedValue(new Error("x"))
    expect(await loadCloseAfterSave()).toBe(false)
    expect(await loadCloseAfter("drag")).toBe(false)
    await saveCloseAfterSave(true)
    await storeLastCapture(null)
    await storeLastCapture({ at: 1 } as CaptureReceipt)
    expect(await loadLastCapture()).toBeNull()
  })
})

describe("syncDocFromStorage (background worker)", () => {
  it("hydrates once, then merges later page writes", async () => {
    await yjs.persistState()
    await yjs.clearState()
    disk[yjs.PERSIST_KEY] = { version: 1, origin: "snapshot", data: yjs.encodeSpacesAsStorage(tree()) }
    resetWorkerHydration()
    expect(await syncDocFromStorage()).toBe(true)
    expect(yjs.getSpaces()).toHaveLength(1)
    // A later snapshot replaces instead of duplicating.
    disk[yjs.PERSIST_KEY] = { version: 1, origin: "snapshot", data: yjs.encodeSpacesAsStorage(tree()) }
    expect(await syncDocFromStorage()).toBe(true)
    expect(yjs.getSpaces()).toHaveLength(1)
    delete disk[yjs.PERSIST_KEY]
    expect(await syncDocFromStorage()).toBe(false)
  })

  it("reports an absent workspace", async () => {
    resetWorkerHydration()
    await yjs.clearState()
    expect(await syncDocFromStorage()).toBe(false)
    vi.mocked(chrome.storage.local.get).mockRejectedValue(new Error("x"))
    expect(await syncDocFromStorage()).toBe(false)
  })
})
