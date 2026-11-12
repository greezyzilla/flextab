import { useEffect, useRef, useState } from "react"
import { describeAlsoSaved } from "~src/lib/savedUrlIndex"
import { rectIntersection, pointerWithin } from "@dnd-kit/core"
import type { DragStartEvent, DragEndEvent, DragOverEvent, DragMoveEvent, CollisionDetection } from "@dnd-kit/core"
import type { SavedTab, SavedGroup } from "~src/types"
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore"
import {
  applyContainerDrop,
  applyDragEnd,
  containerMeets,
  containerReorderTarget,
  edgeAt,
  findGroupLocation,
  findSavedDragItem,
  isDropTargetId,
  parseBoundaryDrop,
  parseContainerDrag,
  type ContainerDrag,
} from "~src/services/dragDrop"
import { toast } from "sonner"
import { showUndoToast } from "~src/components/ui/sonner"
import { useDropIndicator } from "~src/store/useDropIndicator"
import { useSortPreview } from "~src/store/useSortPreview"
import { commitPreview, groupPreview, tabPreview } from "~src/services/sortPreview"
import type { Edge } from "~src/services/moveTo"

type PointerDragEvent = Pick<DragMoveEvent, "active" | "over" | "activatorEvent" | "delta">

/**
 * Where a dragged project or category would go next to a row of its own
 * parent (TASK-64): that row's zone and the side the pointer is on. Null when
 * the drop would move it instead, or not land at all.
 */
function reorderSpot(event: PointerDragEvent): { zone: string; edge: Edge } | null {
  const container = parseContainerDrag(event.active.id)
  const over = event.over
  if (!container || !over || !containerReorderTarget(container, over.id.toString())) return null
  return { zone: over.id.toString(), edge: edgeAt(over.rect, pointerY(event)) }
}

/** How far the pointer must travel before a preview may change again. */
export const PREVIEW_SETTLE_PX = 8

/** The pointer now, or null without a pointer event (keyboard). */
function pointerAt(event: PointerDragEvent): { x: number; y: number } | null {
  const start = event.activatorEvent as MouseEvent | null
  return start && typeof start.clientY === "number" ? { x: start.clientX + event.delta.x, y: start.clientY + event.delta.y } : null
}

/** The pointer's y now; without one, the bottom of the row under it (so: after). */
function pointerY(event: PointerDragEvent): number {
  const start = event.activatorEvent as MouseEvent | null
  const over = event.over!
  return start && typeof start.clientY === "number" ? start.clientY + event.delta.y : over.rect.top + over.rect.height
}

/**
 * A saved tab or group dragged into another list (TASK-64): where it would
 * land, so that list makes room for it while dragging. Undefined: keep the
 * current preview (the pointer is over the dragged item itself, already shown
 * in its new list).
 */
function sortPreviewAt(event: PointerDragEvent) {
  const id = event.active.id
  const over = event.over
  if (typeof id !== "string" || parseContainerDrag(id) || !over) return null
  if (over.id === id) return undefined
  const spaces = useSavedSpacesStore.getState().savedSpaces
  const below = edgeAt(over.rect, pointerY(event)) === "after"
  return findGroupLocation(spaces, id)
    ? groupPreview(spaces, id, over.id.toString(), below)
    : tabPreview(spaces, id, over.id.toString(), below)
}

/** Hovering a rail space this long while dragging a category opens it (spring-loaded, like Finder folders). */
export const SPRING_LOAD_MS = 600

/**
 * Thin dnd-kit adapter (FE-B9). Domain mutations live in services/dragDrop.
 */
export function useDragAndDrop() {
  const [activeId, setActiveId] = useState<string | number | null>(null)
  const [draggedTab, setDraggedTab] = useState<chrome.tabs.Tab | null>(null)
  const [draggedSavedTab, setDraggedSavedTab] = useState<SavedTab | null>(null)
  const [draggedGroup, setDraggedGroup] = useState<SavedGroup | null>(null)
  const [draggedContainer, setDraggedContainer] = useState<(ContainerDrag & { name: string }) | null>(null)
  const springTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const springTarget = useRef<string | null>(null)
  const stopSpring = () => {
    if (springTimer.current) clearTimeout(springTimer.current)
    springTimer.current = null
    springTarget.current = null
  }
  useEffect(() => stopSpring, [])

  const handleDragStart = async (event: DragStartEvent) => {
    const { active } = event
    setActiveId(active.id)

    if (typeof active.id === "number") {
      try {
        const tab = await chrome.tabs.get(active.id as number)
        setDraggedTab(tab)
      } catch (_) {
        /* Tab may have been closed */
      }
      return
    }

    const container = parseContainerDrag(active.id)
    if (container) {
      const project = useSavedSpacesStore.getState().savedSpaces
        .find((s) => s.id === container.spaceId)?.projects.find((p) => p.id === container.projectId)
      const name = container.kind === "project" ? project?.name : project?.categories.find((c) => c.id === container.categoryId)?.name
      setDraggedContainer({ ...container, name: name ?? "" })
      return
    }

    const { group, tab } = findSavedDragItem(
      useSavedSpacesStore.getState().savedSpaces,
      active.id as string,
    )
    if (group) setDraggedGroup(group)
    else if (tab) setDraggedSavedTab(tab)
  }

  const collisionDetectionStrategy: CollisionDetection = (args) => {
    // A project or category only meets the zones that take it (TASK-59).
    const container = activeId === null ? null : parseContainerDrag(activeId)
    if (container) {
      const zones = { ...args, droppableContainers: args.droppableContainers.filter((c) => containerMeets(container, c.id.toString())) }
      const hits = pointerWithin(zones)
      return hits.length > 0 ? hits : rectIntersection(zones)
    }
    if (typeof activeId === "number") {
      const droppableCollisions = rectIntersection({
        ...args,
        droppableContainers: args.droppableContainers.filter((c) =>
          isDropTargetId(c.id.toString()),
        ),
      })
      if (droppableCollisions.length > 0) return droppableCollisions
      return pointerWithin(args)
    }

    const allCollisions = pointerWithin(args)
    const droppableCollisions = rectIntersection({
      ...args,
      droppableContainers: args.droppableContainers.filter((c) =>
        isDropTargetId(c.id.toString()),
      ),
    })
    return [...allCollisions, ...droppableCollisions]
  }

  // Spring-loaded spaces: a category dragged onto a rail space waits there a
  // moment, then that space opens so one of its projects can take the drop.
  // The insertion line follows the pointer within a row, so it updates on move too.
  // Where the pointer was when the preview last changed. Moving an item into
  // another list moves the lists around a still pointer, which would point at
  // something else and flip the preview back, and so on (React stopped it with
  // "maximum update depth"). A change waits until the pointer itself moves.
  const settledAt = useRef<{ x: number; y: number } | null>(null)
  const showReorderSpot = (event: PointerDragEvent) => {
    const spot = reorderSpot(event)
    useDropIndicator.getState().show(spot?.zone ?? null, spot?.edge ?? null)
    const next = sortPreviewAt(event)
    if (next === undefined) return
    const current = useSortPreview.getState().preview
    if (next?.to === current?.to && next?.beforeId === current?.beforeId && next?.id === current?.id) return
    const now = pointerAt(event)
    const last = settledAt.current
    if (now && last && Math.hypot(now.x - last.x, now.y - last.y) < PREVIEW_SETTLE_PX) return
    settledAt.current = now
    useSortPreview.getState().show(next)
  }
  const handleDragMove = (event: DragMoveEvent) => showReorderSpot(event)

  const handleDragOver = (event: DragOverEvent) => {
    showReorderSpot(event)
    const container = parseContainerDrag(event.active.id)
    const zone = event.over ? parseBoundaryDrop(event.over.id.toString()) : null
    const spaceId = container?.kind === "category" && zone?.kind === "space" ? zone.spaceId : null
    if (spaceId === springTarget.current) return
    stopSpring()
    if (!spaceId || spaceId === useSavedSpacesStore.getState().activeSpaceId) return
    springTarget.current = spaceId
    springTimer.current = setTimeout(() => {
      springTimer.current = null
      useSavedSpacesStore.getState().setActiveSpace(spaceId)
    }, SPRING_LOAD_MS)
  }

  // Only the container drag's own state: a cancelled tab or group drag behaves as before.
  const handleDragCancel = () => {
    stopSpring()
    useDropIndicator.getState().show(null, null)
    useSortPreview.getState().show(null)
    settledAt.current = null
    setDraggedContainer(null)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    const wasDraggingGroup = !!draggedGroup

    stopSpring()
    useDropIndicator.getState().show(null, null)
    const preview = useSortPreview.getState().preview
    useSortPreview.getState().show(null)
    settledAt.current = null
    setActiveId(null)
    setDraggedTab(null)
    setDraggedSavedTab(null)
    setDraggedGroup(null)
    setDraggedContainer(null)

    if (!over) return

    // Dropped while shown in another list: it lands where it was shown.
    if (preview && preview.id === active.id) {
      commitPreview(preview)
      return
    }

    const container = parseContainerDrag(active.id)
    if (container) {
      const moved = applyContainerDrop(container, over.id.toString(), reorderSpot(event)?.edge)
      if (moved) showUndoToast(moved.message, moved.undo)
      return
    }

    const args = {
      activeId: active.id as string | number,
      overId: over.id.toString(),
      wasDraggingGroup,
    }
    const outcome = await applyDragEnd(args)
    if (outcome && "unsavable" in outcome) {
      toast(`Can't save “${outcome.unsavable}”`, {
        description: "Only web pages (http/https) can be saved. Browser, extension and local file pages are skipped.",
      })
    } else if (outcome && "saved" in outcome) {
      const { alsoIn, closed, title, undo } = outcome.saved
      const notice = describeAlsoSaved(alsoIn)
      // Closed after saving (Settings › Saving): say so, with Undo.
      if (closed.length) showUndoToast(`Saved and closed “${title}”`, undo, 5000, notice ?? undefined)
      else if (notice) toast(notice)
    }
  }

  return {
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragMove,
    handleDragCancel,
    collisionDetectionStrategy,
    activeId,
    draggedTab,
    draggedSavedTab,
    draggedGroup,
    draggedContainer,
  }
}
