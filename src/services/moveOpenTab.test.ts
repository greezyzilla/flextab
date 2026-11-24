import { beforeEach, describe, expect, it, vi, type Mock } from "vitest"
import { OPEN_PANEL_ZONE, finalIndex, isNoMove, isOpenTabsZone, moveOpenTab, moveOpenTabToNewWindow, previewWindows } from "./moveOpenTab"

const tabs = chrome.tabs as unknown as { query: Mock; move: Mock }
const windows = chrome.windows as unknown as { create: Mock }

beforeEach(() => {
  vi.clearAllMocks()
  tabs.query.mockResolvedValue([{ id: 7 }, { id: 8 }])
  tabs.move.mockResolvedValue({})
  windows.create.mockResolvedValue({})
})

describe("where a dropped open tab lands (TASK-73)", () => {
  it("inside one window counts the final index after the tab left its old place", () => {
    expect(finalIndex({ windowId: 1, index: 1 }, { windowId: 1, index: 4 })).toBe(3)
    expect(finalIndex({ windowId: 1, index: 3 }, { windowId: 1, index: 0 })).toBe(0)
    expect(finalIndex({ windowId: 1, index: 1 }, { windowId: 2, index: 4 })).toBe(4)
  })

  it("sees a drop on either side of the tab itself as no move", () => {
    expect(isNoMove({ windowId: 1, index: 2 }, { windowId: 1, index: 2 })).toBe(true)
    expect(isNoMove({ windowId: 1, index: 2 }, { windowId: 1, index: 3 })).toBe(true)
    expect(isNoMove({ windowId: 1, index: 2 }, { windowId: 1, index: 4 })).toBe(false)
    expect(isNoMove({ windowId: 1, index: 2 }, { windowId: 2, index: 2 })).toBe(false)
  })

  it("knows its own drop zones from the workspace's", () => {
    expect(["open-tab:3", "open-window:1", OPEN_PANEL_ZONE].every(isOpenTabsZone)).toBe(true)
    expect(isOpenTabsZone("droppable-g1")).toBe(false)
  })
})

describe("moving an open tab (TASK-73)", () => {
  it("moves it to the other window, and Undo puts it back at its old index", async () => {
    const undo = await moveOpenTab(7, { windowId: 1, index: 2 }, { windowId: 2, index: 0 })
    expect(tabs.move).toHaveBeenCalledWith(7, { windowId: 2, index: 0 })
    await undo!()
    expect(tabs.move).toHaveBeenLastCalledWith(7, { windowId: 1, index: 2 })
    expect(windows.create).not.toHaveBeenCalled()
  })

  it("Undo opens a window again for the last tab, whose window closed when it left", async () => {
    tabs.query.mockResolvedValue([{ id: 7 }])
    const undo = await moveOpenTab(7, { windowId: 1, index: 0 }, { windowId: 2, index: 3 })
    await undo!()
    expect(windows.create).toHaveBeenCalledWith({ tabId: 7, focused: false })
  })

  it("a window's only tab moved within it keeps its window", async () => {
    tabs.query.mockResolvedValue([{ id: 7 }])
    const undo = await moveOpenTab(7, { windowId: 1, index: 0 }, { windowId: 1, index: 0 })
    expect(undo).toBeNull()
    tabs.query.mockResolvedValue([{ id: 7 }, { id: 8 }])
    const back = await moveOpenTab(7, { windowId: 1, index: 0 }, { windowId: 1, index: 2 })
    expect(tabs.move).toHaveBeenCalledWith(7, { windowId: 1, index: 1 })
    await back!()
    expect(windows.create).not.toHaveBeenCalled()
  })

  it("offers no Undo when nothing moved, and an Undo for a tab gone since does nothing", async () => {
    expect(await moveOpenTab(7, { windowId: 1, index: 2 }, { windowId: 1, index: 3 })).toBeNull()
    expect(tabs.move).not.toHaveBeenCalled()
    tabs.query.mockRejectedValueOnce(new Error("no window"))
    tabs.move.mockRejectedValueOnce(new Error("closed"))
    expect(await moveOpenTab(7, { windowId: 1, index: 2 }, { windowId: 2, index: 0 })).toBeNull()
    const undo = await moveOpenTab(7, { windowId: 1, index: 2 }, { windowId: 2, index: 0 })
    tabs.move.mockRejectedValueOnce(new Error("closed"))
    await expect(undo!()).resolves.toBeUndefined()
  })
})

describe("the lists while an open tab is dragged (TASK-73)", () => {
  const t = (id: number, windowId: number, index: number) => ({ id, windowId, index, url: `https://${id}.example` }) as chrome.tabs.Tab
  const windows = [{ id: 1, tabs: [t(1, 1, 0), t(2, 1, 1), t(3, 1, 2)] }, { id: 2, tabs: [t(4, 2, 0), t(5, 2, 1)] }]
  const ids = (ws: typeof windows) => ws.map((w) => (w.tabs ?? []).map((x) => x.id))

  it("shows the tab at its landing spot in another window, gone from its own", () => {
    expect(ids(previewWindows(windows, { tabId: 2, from: { windowId: 1, index: 1 }, slot: { windowId: 2, index: 1 }, label: "Window 2" }))).toEqual([[1, 3], [4, 2, 5]])
    expect(ids(previewWindows(windows, { tabId: 2, from: { windowId: 1, index: 1 }, slot: { windowId: 2, index: 2 }, label: "Window 2" }))).toEqual([[1, 3], [4, 5, 2]])
  })

  it("moves it within its own window, and leaves the lists alone without a preview or a known tab", () => {
    expect(ids(previewWindows(windows, { tabId: 1, from: { windowId: 1, index: 0 }, slot: { windowId: 1, index: 3 }, label: "Window 1" }))).toEqual([[2, 3, 1], [4, 5]])
    expect(previewWindows(windows, null)).toBe(windows)
    expect(previewWindows(windows, { tabId: 99, from: { windowId: 1, index: 0 }, slot: { windowId: 2, index: 0 }, label: "Window 2" })).toBe(windows)
    expect(previewWindows(windows, { tabId: 4, from: { windowId: 2, index: 0 }, slot: { windowId: 2, index: 2 }, label: "Window 2" })[0]).toBe(windows[0])
  })

  it("copes with a window that lists no tabs yet", () => {
    const bare = [...windows, { id: 3 }] as typeof windows
    expect(ids(previewWindows(bare, { tabId: 2, from: { windowId: 1, index: 1 }, slot: { windowId: 3, index: 0 }, label: "Window 3" }))).toEqual([[1, 3], [4, 5], [2]])
    expect(ids(previewWindows(bare, { tabId: 2, from: { windowId: 1, index: 1 }, slot: { windowId: 2, index: 0 }, label: "Window 2" }))).toEqual([[1, 3], [2, 4, 5], []])
  })
})

describe("moving an open tab into a new window (TASK-94)", () => {
  it("gives the tab a window of its own, and Undo puts it back where it was", async () => {
    vi.mocked(chrome.windows.create).mockResolvedValueOnce({ id: 77 } as never)
    const undo = await moveOpenTabToNewWindow(5, { windowId: 9, index: 2 })
    expect(chrome.windows.create).toHaveBeenCalledWith({ tabId: 5, focused: false })
    await undo!()
    expect(chrome.tabs.move).toHaveBeenCalledWith(5, { windowId: 9, index: 2 })
  })

  it("reports nothing to undo when the window cannot be made, and an Undo that finds the tab gone does nothing", async () => {
    vi.mocked(chrome.windows.create).mockRejectedValueOnce(new Error("No tab"))
    expect(await moveOpenTabToNewWindow(5, { windowId: 9, index: 2 })).toBeNull()
    vi.mocked(chrome.windows.create).mockResolvedValueOnce({ id: 78 } as never)
    const undo = await moveOpenTabToNewWindow(6, { windowId: 9, index: 0 })
    vi.mocked(chrome.tabs.move).mockRejectedValueOnce(new Error("No tab"))
    await expect(undo!()).resolves.toBeUndefined()
  })
})
