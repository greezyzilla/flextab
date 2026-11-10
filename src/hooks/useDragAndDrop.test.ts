import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { PREVIEW_SETTLE_PX, SPRING_LOAD_MS, useDragAndDrop } from "./useDragAndDrop"
import { categoryDragId, projectDragId } from "~src/services/dragDrop"
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore"
import { showUndoToast } from "~src/components/ui/sonner"
import * as yjs from "~src/lib/yjsDoc"
import { useDropIndicator } from "~src/store/useDropIndicator"
import { useSortPreview } from "~src/store/useSortPreview"

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
  })
  const at = (id: string, overId: string | null, y: number) => ({
    active: { id }, over: overId ? { id: overId, rect: { top: 100, height: 20 } } : null,
    activatorEvent: { clientY: 50 }, delta: { x: 0, y },
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
