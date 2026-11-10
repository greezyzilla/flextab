import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SPRING_LOAD_MS, useDragAndDrop } from "./useDragAndDrop"
import { categoryDragId, projectDragId } from "~src/services/dragDrop"
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore"
import { showUndoToast } from "~src/components/ui/sonner"
import * as yjs from "~src/lib/yjsDoc"

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
