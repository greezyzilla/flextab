import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { PREVIEW_SETTLE_PX, SPRING_LOAD_MS, useDragAndDrop } from "./useDragAndDrop"
import { categoryDragId, projectDragId } from "~src/services/dragDrop"
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore"
import { showUndoToast } from "~src/components/ui/sonner"
import * as yjs from "~src/lib/yjsDoc"
import { useDropIndicator } from "~src/store/useDropIndicator"
import { useContainerPreview } from "~src/store/useContainerPreview"
import { useSortPreview } from "~src/store/useSortPreview"
import { useOpenTabPreview } from "~src/store/useOpenTabPreview"

vi.mock("~src/components/ui/sonner", () => ({ showUndoToast: vi.fn() }))

beforeEach(async () => {
  vi.clearAllMocks()
  await yjs.clearState()
  yjs.setSpaces([
    { id: "h", name: "Hobby", order: 0, projects: [{ id: "p1", name: "Test", order: 0, categories: [{ id: "c1", name: "Music", order: 0, groups: [] }] }] },
    { id: "e", name: "Personal", order: 1, projects: [{ id: "p2", name: "Home", order: 0, categories: [] }] },
  ])
  useSavedSpacesStore.setState({ savedSpaces: yjs.getSpaces(), activeSpaceId: "h", activeProjectId: "p1", activeCategoryId: "c1" })
})

const drag = (id: string) => ({ active: { id } }) as any
const over = (id: string, overId: string | null) => ({ active: { id }, over: overId ? { id: overId } : null }) as any
const zone = (id: string) => ({ id, rect: { current: null }, data: { current: {} }, disabled: false, key: id, node: { current: null } })

describe("dragging a project or a category (TASK-59)", () => {
  it("names the dragged container for the overlay, moves it on drop, and offers Undo", async () => {
    const { result } = renderHook(() => useDragAndDrop())
    const id = categoryDragId("h", "p1", "c1")
    await act(() => result.current.handleDragStart(drag(id)))
    expect(result.current.draggedContainer).toMatchObject({ kind: "category", name: "Music" })
    await act(() => result.current.handleDragEnd(over(id, "proj-drop:e:p2")))
    expect(result.current.draggedContainer).toBeNull()
    expect(yjs.getSpaces()[1].projects[0].categories.map((c) => c.name)).toEqual(["Music"])
    expect(showUndoToast).toHaveBeenCalledWith("Moved “Music” to Personal › Home", expect.any(Function))
  })

  it("only meets zones that take the container", async () => {
    const { result } = renderHook(() => useDragAndDrop())
    const id = projectDragId("h", "p1")
    await act(() => result.current.handleDragStart(drag(id)))
    const rect = { top: 0, left: 0, right: 10, bottom: 10, width: 10, height: 10 }
    const droppableRects = new Map([["space-drop:e", rect], ["proj-drop:e:p2", rect]])
    const hits = result.current.collisionDetectionStrategy({
      active: { id } as any, collisionRect: rect, droppableRects: droppableRects as any,
      droppableContainers: [zone("space-drop:e"), zone("proj-drop:e:p2")] as any, pointerCoordinates: { x: 5, y: 5 },
    })
    expect(hits.map((h) => h.id)).toEqual(["space-drop:e"])
    const outside = result.current.collisionDetectionStrategy({
      active: { id } as any, collisionRect: rect, droppableRects: droppableRects as any,
      droppableContainers: [zone("space-drop:e")] as any, pointerCoordinates: { x: 50, y: 50 },
    })
    expect(outside.map((h) => h.id)).toEqual(["space-drop:e"]) // the card still overlaps it
  })

  it("opens a rail space after a category hovers it, and not for a project or a short pass", async () => {
    vi.useFakeTimers()
    try {
      const { result } = renderHook(() => useDragAndDrop())
      const cat = categoryDragId("h", "p1", "c1")
      act(() => result.current.handleDragOver(over(cat, "space-drop:e")))
      act(() => { vi.advanceTimersByTime(SPRING_LOAD_MS - 100) })
      act(() => result.current.handleDragOver(over(cat, "proj-drop:h:p1"))) // moved on before it opened
      act(() => { vi.advanceTimersByTime(SPRING_LOAD_MS) })
      expect(useSavedSpacesStore.getState().activeSpaceId).toBe("h")
      act(() => result.current.handleDragOver(over(projectDragId("h", "p1"), "space-drop:e")))
      act(() => { vi.advanceTimersByTime(SPRING_LOAD_MS) })
      expect(useSavedSpacesStore.getState().activeSpaceId).toBe("h")
      act(() => result.current.handleDragOver(over(cat, "space-drop:h"))) // already open
      act(() => result.current.handleDragOver(over(cat, "space-drop:e")))
      act(() => result.current.handleDragOver(over(cat, "space-drop:e"))) // still there: the timer keeps running
      act(() => { vi.advanceTimersByTime(SPRING_LOAD_MS) })
      expect(useSavedSpacesStore.getState().activeSpaceId).toBe("e")
    } finally { vi.useRealTimers() }
  })

  it("a cancelled or finished drag stops a pending space switch", async () => {
    vi.useFakeTimers()
    try {
      const { result } = renderHook(() => useDragAndDrop())
      const cat = categoryDragId("h", "p1", "c1")
      act(() => result.current.handleDragOver(over(cat, "space-drop:e")))
      act(() => result.current.handleDragCancel())
      act(() => { vi.advanceTimersByTime(SPRING_LOAD_MS) })
      expect(useSavedSpacesStore.getState().activeSpaceId).toBe("h")
      act(() => result.current.handleDragOver(over(cat, "space-drop:e")))
      await act(() => result.current.handleDragEnd(over(cat, null)))
      act(() => { vi.advanceTimersByTime(SPRING_LOAD_MS) })
      expect(useSavedSpacesStore.getState().activeSpaceId).toBe("h")
      expect(showUndoToast).not.toHaveBeenCalled()
    } finally { vi.useRealTimers() }
  })
})

describe("the insertion line while reordering (TASK-64)", () => {
  beforeEach(() => {
    yjs.setSpaces([{ id: "h", name: "Hobby", order: 0, projects: [
      { id: "p1", name: "Test", order: 0, categories: [{ id: "c1", name: "Music", order: 0, groups: [] }, { id: "c2", name: "Films", order: 1, groups: [] }] },
      { id: "p2", name: "Games", order: 1, categories: [] },
    ] }])
    useSavedSpacesStore.setState({ savedSpaces: yjs.getSpaces(), activeSpaceId: "h" })
    useDropIndicator.getState().show(null, null)
    useContainerPreview.getState().show(null)
  })
  const at = (id: string, overId: string | null, y: number) => ({
    active: { id }, over: overId ? { id: overId, rect: { top: 100, height: 20 } } : null,
    activatorEvent: { clientX: 10, clientY: 50 }, delta: { x: 0, y },
  }) as any

  it("follows the pointer within a row and clears off it", () => {
    const { result } = renderHook(() => useDragAndDrop())
    const id = projectDragId("h", "p2")
    act(() => result.current.handleDragOver(at(id, "proj-drop:h:p1", 52))) // pointer at 102: top half
    expect(useDropIndicator.getState()).toMatchObject({ zone: "proj-drop:h:p1", edge: "before" })
    act(() => result.current.handleDragMove(at(id, "proj-drop:h:p1", 66))) // 116: bottom half
    expect(useDropIndicator.getState().edge).toBe("after")
    act(() => result.current.handleDragMove(at(id, "space-drop:x", 66))) // a move, not a reorder
    expect(useDropIndicator.getState().zone).toBeNull()
    act(() => result.current.handleDragMove(at(id, "proj-drop:h:p1", 52)))
    act(() => result.current.handleDragCancel())
    expect(useDropIndicator.getState().zone).toBeNull()
  })

  it("drops on the side the line showed", async () => {
    const { result } = renderHook(() => useDragAndDrop())
    const id = categoryDragId("h", "p1", "c2")
    await act(() => result.current.handleDragEnd(at(id, "cat-drop:h:p1:c1", 52)))
    expect(yjs.getSpaces()[0].projects[0].categories.map((c) => c.id)).toEqual(["c2", "c1"])
    expect(showUndoToast).toHaveBeenCalledWith("Moved “Films” above “Music”", expect.any(Function))
    expect(useDropIndicator.getState().zone).toBeNull()
  })

  it("shows the new order while dragging, keeps it over its own row, and drops there (TASK-92)", async () => {
    const { result } = renderHook(() => useDragAndDrop())
    const id = categoryDragId("h", "p1", "c1")
    act(() => result.current.handleDragOver(at(id, "cat-drop:h:p1:c2", 66))) // bottom half of Films
    expect(useContainerPreview.getState().preview).toEqual({ kind: "category", id: "c1", next: "c2", edge: "after" })
    // The list moved: the pointer is now over Music itself; the shown order stays.
    act(() => result.current.handleDragMove(at(id, "cat-drop:h:p1:c1", 66 + PREVIEW_SETTLE_PX)))
    expect(useContainerPreview.getState().preview?.next).toBe("c2")
    await act(() => result.current.handleDragEnd(at(id, "cat-drop:h:p1:c1", 66 + PREVIEW_SETTLE_PX)))
    expect(yjs.getSpaces()[0].projects[0].categories.map((c) => c.id)).toEqual(["c2", "c1"])
    expect(showUndoToast).toHaveBeenCalledWith("Moved “Music” below “Films”", expect.any(Function))
    expect(useContainerPreview.getState().preview).toBeNull()
  })

  it("drops where the list showed it even when the pointer left every row", async () => {
    const { result } = renderHook(() => useDragAndDrop())
    const id = projectDragId("h", "p2")
    act(() => result.current.handleDragOver(at(id, "proj-drop:h:p1", 52)))
    expect(useContainerPreview.getState().preview).toEqual({ kind: "project", id: "p2", next: "p1", edge: "before" })
    await act(() => result.current.handleDragEnd(at(id, null, 52)))
    expect(yjs.getSpaces()[0].projects.map((p) => p.id)).toEqual(["p2", "p1"])
  })

  it("waits for the pointer to move before the shown order changes, and clears off the list", () => {
    const { result } = renderHook(() => useDragAndDrop())
    const id = projectDragId("h", "p2")
    act(() => result.current.handleDragOver(at(id, "proj-drop:h:p1", 52)))
    act(() => result.current.handleDragMove(at(id, "proj-drop:h:p1", 56))) // 106: still the top half
    expect(useContainerPreview.getState().preview?.edge).toBe("before")
    act(() => result.current.handleDragMove(at(id, "space-drop:e", 52 + 2))) // still pointer: kept
    expect(useContainerPreview.getState().preview).not.toBeNull()
    act(() => result.current.handleDragMove(at(id, "space-drop:e", 52 + 40))) // moved: a move elsewhere, no order shown
    expect(useContainerPreview.getState().preview).toBeNull()
    act(() => result.current.handleDragOver(at(id, "proj-drop:h:p1", 52)))
    act(() => result.current.handleDragCancel())
    expect(useContainerPreview.getState().preview).toBeNull()
  })

  it("falls back to below the row without a pointer position", async () => {
    const { result } = renderHook(() => useDragAndDrop())
    const id = projectDragId("h", "p1")
    await act(() => result.current.handleDragEnd({ ...at(id, "proj-drop:h:p2", 0), activatorEvent: null }))
    expect(yjs.getSpaces()[0].projects.map((p) => p.id)).toEqual(["p2", "p1"])
  })
})

describe("tabs and groups make room in another list while dragging (TASK-64)", () => {
  const tab = (id: string, order: number) => ({ id, url: `https://${id}.test`, title: id, favicon: "", order })
  beforeEach(() => {
    yjs.setSpaces([{ id: "h", name: "Hobby", order: 0, projects: [{ id: "p1", name: "Test", order: 0, categories: [
      { id: "c1", name: "Music", order: 0, groups: [{ id: "g1", name: "Playlists", order: 0, tabs: [tab("a", 0), tab("b", 1)] }, { id: "g2", name: "Radio", order: 1, tabs: [tab("x", 0), tab("y", 1)] }] },
    ] }] }])
    useSavedSpacesStore.setState({ savedSpaces: yjs.getSpaces(), activeSpaceId: "h" })
    useSortPreview.getState().show(null)
  })
  const at = (id: string, overId: string | null, y: number, x = 0) => ({
    active: { id }, over: overId ? { id: overId, rect: { top: 100, height: 20 } } : null,
    activatorEvent: { clientX: 10, clientY: 50 }, delta: { x, y },
  }) as any
  const tabsOf = (g: string) => [...yjs.getSpaces()[0].projects[0].categories[0].groups.find((x) => x.id === g)!.tabs]
    .sort((p, q) => (p.order ?? 0) - (q.order ?? 0)).map((t) => t.id).join("")

  it("shows the tab in the other group, keeps it while over itself, and drops it there", async () => {
    const { result } = renderHook(() => useDragAndDrop())
    act(() => result.current.handleDragOver(at("a", "y", 52)))
    expect(useSortPreview.getState().preview).toMatchObject({ id: "a", to: "g2", beforeId: "y" })
    act(() => result.current.handleDragMove(at("a", "a", 52))) // over its own new slot
    expect(useSortPreview.getState().preview).toMatchObject({ to: "g2" })
    await act(() => result.current.handleDragEnd(at("a", "a", 52)))
    expect(tabsOf("g2")).toBe("xay")
    expect(useSortPreview.getState().preview).toBeNull()
  })

  it("lets the tab go back when the pointer returns to its own group or leaves for the sidebar", () => {
    const { result } = renderHook(() => useDragAndDrop())
    act(() => result.current.handleDragOver(at("a", "y", 52)))
    act(() => result.current.handleDragOver(at("a", "b", 52, 20)))
    expect(useSortPreview.getState().preview).toBeNull()
    act(() => result.current.handleDragOver(at("a", "y", 52, 40)))
    act(() => result.current.handleDragOver(at("a", "cat-drop:h:p1:c1", 52, 60)))
    expect(useSortPreview.getState().preview).toBeNull()
  })

  it("waits for the pointer to move before changing a preview, so shifting lists cannot loop", () => {
    const { result } = renderHook(() => useDragAndDrop())
    act(() => result.current.handleDragOver(at("a", "y", 52)))
    // The lists moved under a still pointer: it is now over its own old group.
    act(() => result.current.handleDragOver(at("a", "b", 52)))
    expect(useSortPreview.getState().preview).toMatchObject({ to: "g2" })
    act(() => result.current.handleDragMove(at("a", "b", 52, PREVIEW_SETTLE_PX - 1)))
    expect(useSortPreview.getState().preview).toMatchObject({ to: "g2" })
    act(() => result.current.handleDragMove(at("a", "b", 52, PREVIEW_SETTLE_PX)))
    expect(useSortPreview.getState().preview).toBeNull()
  })

  it("drops nothing when released over no zone, and a cancel clears the preview", async () => {
    const { result } = renderHook(() => useDragAndDrop())
    act(() => result.current.handleDragOver(at("a", "y", 52)))
    await act(() => result.current.handleDragEnd(at("a", null, 52)))
    expect(tabsOf("g1")).toBe("ab")
    act(() => result.current.handleDragOver(at("a", "y", 52)))
    expect(useSortPreview.getState().preview).not.toBeNull() // a new drag starts unsettled
    act(() => result.current.handleDragCancel())
    expect(useSortPreview.getState().preview).toBeNull()
  })

  it("previews nothing for open browser tabs or containers", () => {
    const { result } = renderHook(() => useDragAndDrop())
    act(() => result.current.handleDragOver(at(42 as any, "droppable-g2", 52)))
    act(() => result.current.handleDragOver(at(projectDragId("h", "p1"), "droppable-g2", 52)))
    expect(useSortPreview.getState().preview).toBeNull()
  })
})

describe("moving an open tab in Opened Tabs (TASK-73)", () => {
  const from = { windowId: 1, index: 0, name: "Docs" }
  const row = (index: number, windowId = 2) => ({ windowId, index, label: `Window ${windowId}` })
  const at = (overId: string | null, data: object | undefined, y: number) => ({
    active: { id: 5, data: { current: from } },
    over: overId ? { id: overId, rect: { top: 100, height: 20 }, data: { current: data } } : null,
    activatorEvent: { clientX: 0, clientY: 50 }, delta: { x: 0, y },
  }) as any
  beforeEach(() => {
    useDropIndicator.getState().show(null, null)
    useOpenTabPreview.getState().show(null)
    vi.mocked(chrome.tabs.query).mockResolvedValue([{ id: 5 }, { id: 6 }] as any)
    vi.mocked(chrome.tabs.move).mockResolvedValue({} as any)
  })

  it("shows the tab where it would land, so the rows make room; no line (TASK-73)", () => {
    const { result } = renderHook(() => useDragAndDrop())
    const shown = () => useOpenTabPreview.getState().preview
    act(() => result.current.handleDragOver(at("open-tab:9", row(1), 52))) // top half: before the row
    expect(shown()).toMatchObject({ tabId: 5, from: { windowId: 1, index: 0 }, slot: { windowId: 2, index: 1 }, label: "Window 2" })
    expect(useDropIndicator.getState().zone).toBeNull()
    act(() => result.current.handleDragMove(at("open-tab:9", row(1), 66))) // bottom half, 14px on
    expect(shown()?.slot).toEqual({ windowId: 2, index: 2 })
    act(() => result.current.handleDragMove(at("open-tab:5", row(0, 1), 80))) // over itself, shown there: kept
    expect(shown()?.slot).toEqual({ windowId: 2, index: 2 })
    act(() => result.current.handleDragMove(at("open-tab:9", row(1), 70))) // 10px back up but still bottom half: same spot
    act(() => result.current.handleDragMove(at("open-window:2", { windowId: 2, index: 3, label: "Window 2" }, 90)))
    expect(shown()).toBeNull() // its header lights up instead; the lists stay put
    act(() => result.current.handleDragMove(at("open-tab:7", row(1, 1), 52))) // beside itself in its own window
    expect(shown()).toBeNull()
    act(() => result.current.handleDragMove(at("open-tab:9", row(1), 66)))
    act(() => result.current.handleDragCancel())
    expect(shown()).toBeNull()
  })

  it("waits for the pointer to move before showing another spot, so moving rows cannot loop", () => {
    const { result } = renderHook(() => useDragAndDrop())
    act(() => result.current.handleDragOver(at("open-tab:9", row(1), 52)))
    act(() => result.current.handleDragMove(at("open-tab:8", row(2), 55))) // a row moved under a still pointer
    expect(useOpenTabPreview.getState().preview?.slot).toEqual({ windowId: 2, index: 1 })
  })

  it("drops where the tab was shown, even released over itself", async () => {
    const { result } = renderHook(() => useDragAndDrop())
    act(() => result.current.handleDragOver(at("open-tab:9", row(1), 66)))
    await act(() => result.current.handleDragEnd(at("open-tab:5", row(0, 1), 66)))
    expect(chrome.tabs.move).toHaveBeenCalledWith(5, { windowId: 2, index: 2 })
    expect(useOpenTabPreview.getState().preview).toBeNull()
  })

  it("without a preview yet, moves the tab beside the row under it, or to the end of a window whose header it is on, with Undo", async () => {
    const { result } = renderHook(() => useDragAndDrop())
    await act(() => result.current.handleDragEnd(at("open-tab:9", row(1), 66)))
    expect(chrome.tabs.move).toHaveBeenCalledWith(5, { windowId: 2, index: 2 })
    expect(showUndoToast).toHaveBeenCalledWith("Moved “Docs” to Window 2", expect.any(Function))
    await act(() => result.current.handleDragEnd(at("open-window:2", { windowId: 2, index: 3, label: "Window 2" }, 52)))
    expect(chrome.tabs.move).toHaveBeenLastCalledWith(5, { windowId: 2, index: 3 })
    await act(() => result.current.handleDragEnd(at("open-tab:7", row(2, 1), 66))) // within its own window
    expect(chrome.tabs.move).toHaveBeenLastCalledWith(5, { windowId: 1, index: 2 })
    expect(showUndoToast).toHaveBeenLastCalledWith("Moved “Docs”", expect.any(Function))
    vi.mocked(showUndoToast).mock.lastCall![1]()
    await vi.waitFor(() => expect(chrome.tabs.move).toHaveBeenLastCalledWith(5, { windowId: 1, index: 0 }))
  })

  it("moves nothing where the tab would stay put, or between targets", async () => {
    const { result } = renderHook(() => useDragAndDrop())
    await act(() => result.current.handleDragEnd(at("open-tab:5", row(0, 1), 52)))
    await act(() => result.current.handleDragEnd(at("open-tabs-panel", undefined, 52)))
    expect(chrome.tabs.move).not.toHaveBeenCalled()
    expect(showUndoToast).not.toHaveBeenCalled()
  })

  it("over Opened Tabs an open tab meets only its rows and headers; saved items never meet them", async () => {
    const { result } = renderHook(() => useDragAndDrop())
    vi.mocked(chrome.tabs.get).mockResolvedValue({ id: 5 } as any)
    await act(() => result.current.handleDragStart({ active: { id: 5 } } as any))
    const r = (top: number, bottom: number, left = 0, right = 300) => ({ top, bottom, left, right, width: right - left, height: bottom - top })
    const droppableRects = new Map<string, ReturnType<typeof r>>([
      ["open-tabs-panel", r(0, 400)], ["open-window:1", r(0, 40)], ["open-tab:9", r(50, 70)], ["open-tab:8", r(72, 92)], ["droppable-g", r(0, 400, -400, 10)],
    ])
    const hit = (x: number, y: number) => result.current.collisionDetectionStrategy({
      active: { id: 5 } as any, collisionRect: r(y - 10, y + 10, x - 150, x + 150), droppableRects: droppableRects as any,
      droppableContainers: [...droppableRects.keys()].map(zone) as any, pointerCoordinates: { x, y },
    }).map((h) => h.id)
    expect(hit(100, 60)).toEqual(["open-tab:9"])
    expect(hit(100, 71)).toEqual(["open-tab:9"]) // the gap between rows: the nearest row
    expect(hit(100, 300)).toEqual([]) // empty panel space: nothing, not the workspace under the card
    expect(hit(-100, 60)).toEqual(["droppable-g"])
    // A row read where it is now (it moved aside), and a stuck header over a row wins the tie.
    const live = { ...zone("open-tab:7"), node: { current: { getBoundingClientRect: () => r(200, 220) } } }
    const header = zone("open-window:2")
    droppableRects.set("open-window:2", r(205, 245)); droppableRects.set("open-tab:7", r(0, 1))
    const at210 = result.current.collisionDetectionStrategy({
      active: { id: 5 } as any, collisionRect: r(200, 220), droppableRects: droppableRects as any,
      droppableContainers: [zone("open-tabs-panel"), live, header] as any, pointerCoordinates: { x: 100, y: 210 },
    }).map((h) => h.id)
    expect(at210).toEqual(["open-window:2"])
    const at202 = result.current.collisionDetectionStrategy({
      active: { id: 5 } as any, collisionRect: r(200, 220), droppableRects: droppableRects as any,
      droppableContainers: [zone("open-tabs-panel"), live, header] as any, pointerCoordinates: { x: 100, y: 202 },
    }).map((h) => h.id)
    expect(at202).toEqual(["open-tab:7"])
    act(() => result.current.handleDragCancel())
    await act(() => result.current.handleDragEnd({ active: { id: 5 }, over: null } as any))
    const saved = result.current.collisionDetectionStrategy({
      active: { id: "t1" } as any, collisionRect: r(50, 70, 0, 300), droppableRects: droppableRects as any,
      droppableContainers: ["open-tabs-panel", "open-tab:9"].map(zone) as any, pointerCoordinates: { x: 100, y: 60 },
    })
    expect(saved).toEqual([])
  })
})
