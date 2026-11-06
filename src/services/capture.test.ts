import { beforeEach, describe, expect, it, vi } from "vitest"
import * as yjs from "~src/lib/yjsDoc"
import type { SavedSpace } from "~src/types"
import {
  captureTabs, undoCapture, moveCapture, closeSavedTabs, reopenTabs, defaultDestination,
  loadDefaultDestination, isCaptureFailure, loadCloseAfterSave, saveCloseAfterSave,
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

  it("creates a named group when none is given", async () => {
    const r = receipt(await captureTabs([{ url: "https://b.com" }], { spaceId: "s", projectId: "p", categoryId: "c2", newGroupName: "Moodboard" }))
    expect(r.createdGroup).toBe(true)
    expect(groupsOf("c2")).toMatchObject([{ id: r.target.groupId, name: "Moodboard" }])
    const unnamed = receipt(await captureTabs([{ url: "https://c.com" }], { spaceId: "s", projectId: "p", categoryId: "c2", groupId: "gone" }))
    expect(groupsOf("c2").find(g => g.id === unnamed.target.groupId)!.name).toBe("New Group")
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

  it("fails without writing when nothing is savable or the category is gone", async () => {
    expect(await captureTabs([{ url: "about:blank" }], { spaceId: "s", projectId: "p", categoryId: "c" })).toEqual({ error: "nothing-savable", skipped: 1 })
    expect(await captureTabs([{ url: "https://b.com" }], { spaceId: "s", projectId: "p", categoryId: "nope" })).toEqual({ error: "no-destination", skipped: 0 })
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
    expect(await moveCapture(moved, { spaceId: "s", projectId: "p", categoryId: "nope" })).toEqual({ error: "no-destination", skipped: 0 })
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
    expect(closed).toEqual([{ windowId: 7, index: 0, url: "https://a.com" }, { windowId: 7, index: 1, url: "https://b.com" }])
    expect(await closeSavedTabs([{ id: 5, url: "about:blank" }])).toEqual([])
  })

  it("closes tabs with no window info without opening a placeholder tab", async () => {
    expect(await closeSavedTabs([{ id: 6, url: "https://d.com" }])).toEqual([{ windowId: -1, index: 0, url: "https://d.com" }])
    expect(chrome.tabs.query).not.toHaveBeenCalled()
  })

  it("reopens in a new window when the original window is gone", async () => {
    vi.mocked(chrome.tabs.create).mockRejectedValueOnce(new Error("No window"))
    await reopenTabs([{ windowId: 9, index: 0, url: "https://a.com" }])
    expect(chrome.windows.create).toHaveBeenCalledWith({ url: ["https://a.com"] })
    await reopenTabs([])
  })
})

describe("defaults and settings", () => {
  it("picks the last group, else its category as a new group, else the first category", () => {
    const spaces = yjs.getSpaces()
    expect(defaultDestination(spaces, [{ spaceId: "s", projectId: "p", categoryId: "c", groupId: "g" }])).toMatchObject({ categoryId: "c", groupId: "g" })
    expect(defaultDestination(spaces, [{ spaceId: "s", projectId: "p", categoryId: "c2", groupId: "gone" }])).toEqual({ spaceId: "s", projectId: "p", categoryId: "c2", groupId: undefined })
    expect(defaultDestination(spaces, [{ spaceId: "x", projectId: "p", categoryId: "c" }])).toMatchObject({ categoryId: "c", groupId: "g" })
    expect(defaultDestination([], [])).toBeNull()
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

  it("survives storage failures", async () => {
    vi.mocked(chrome.storage.local.get).mockRejectedValue(new Error("x"))
    vi.mocked(chrome.storage.local.set).mockRejectedValue(new Error("x"))
    vi.mocked(chrome.storage.local.remove).mockRejectedValue(new Error("x"))
    expect(await loadCloseAfterSave()).toBe(false)
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
