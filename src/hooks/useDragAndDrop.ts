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
  containerZone,
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
import { useContainerPreview, type ContainerPreview } from "~src/store/useContainerPreview"
import { useSortPreview } from "~src/store/useSortPreview"
import { commitPreview, groupPreview, tabPreview } from "~src/services/sortPreview"
import type { Edge } from "~src/services/moveTo"
import { OPEN_PANEL_ZONE, OPEN_TAB_ZONE, OPEN_WINDOW_ZONE, isNoMove, isOpenTabsZone, moveOpenTab, type OpenTabPreview, type TabPlace } from "~src/services/moveOpenTab"
import { useOpenTabPreview } from "~src/store/useOpenTabPreview"

type PointerDragEvent = Pick<DragMoveEvent, "active" | "over" | "activatorEvent" | "delta">

/** What an Opened Tabs row or window header tells the drag about itself. */
export interface OpenTabZoneData { windowId: number; index: number; label: string }
/** What a dragged open tab tells about itself. */
export interface OpenTabDragData extends TabPlace { name: string }

/**
 * Where a dragged open tab would land in Opened Tabs: beside the row
 * under the pointer, on the side the pointer is on, or at the end of a window
 * whose header it is over. Null off Opened Tabs, or where it would not move.
 */
function openTabSpot(event: PointerDragEvent): { slot: TabPlace; label: string; zone: string; edge: Edge | null } | null {
  const over = event.over
  const from = event.active.data?.current as OpenTabDragData | undefined
  const data = over?.data?.current as OpenTabZoneData | undefined
  if (typeof event.active.id !== "number" || !over || !from || !data) return null
  const zone = over.id.toString()
  // The rows move aside while dragging, so the row's place now, not at drag start.
  const live = typeof document === "undefined" ? null : document.querySelector(`[data-open-zone="${zone}"]`)?.getBoundingClientRect()
  const edge = zone.startsWith(OPEN_TAB_ZONE) ? edgeAt(live?.height ? live : over.rect, pointerY(event)) : null
  if (!edge && !zone.startsWith(OPEN_WINDOW_ZONE)) return null
  const slot = { windowId: data.windowId, index: data.index + (edge === "after" ? 1 : 0) }
  return isNoMove(from, slot) ? null : { slot, label: data.label, zone, edge }
}

/**
 * Where an open tab dragged in Opened Tabs is shown: at the spot it
 * would land, or where it is (null). Undefined keeps the current preview: the
 * pointer is over the tab itself, already shown at its new spot.
 */
function openTabPreviewAt(event: PointerDragEvent): OpenTabPreview | null | undefined {
  const id = event.active.id
  if (typeof id !== "number") return null
  if (event.over?.id === `${OPEN_TAB_ZONE}${id}`) return undefined
  const spot = openTabSpot(event)
  const from = event.active.data?.current as OpenTabDragData | undefined
  // A window header takes the tab at its end and lights up, as a group card
  // does; the lists stay put, so the header never slides away under the pointer.
  return spot?.edge && from ? { tabId: id, from: { windowId: from.windowId, index: from.index }, slot: spot.slot, label: spot.label } : null
}

/**
 * An open tab over Opened Tabs meets the row or window header under
 * the pointer, or the nearest one within 8px; empty panel space meets nothing,
 * so a drop there never reaches the workspace. Rects are read now, since the
 * rows move aside while dragging. Null: the pointer is not over the panel.
 */
function openTabsCollision({ droppableContainers, droppableRects, pointerCoordinates }: Parameters<CollisionDetection>[0]): ReturnType<CollisionDetection> | null {
  if (!pointerCoordinates) return null
  const { x, y } = pointerCoordinates
  const zones = droppableContainers.filter((c) => isOpenTabsZone(c.id.toString()))
  const rectOf = (c: (typeof zones)[number]) => {
    const r = c.node.current?.getBoundingClientRect()
    return r && r.height ? r : droppableRects.get(c.id)
  }
  const panel = zones.find((c) => c.id === OPEN_PANEL_ZONE)
  const p = panel && rectOf(panel)
  if (!p || x < p.left || x > p.right || y < p.top || y > p.bottom) return null
  let best: { container: (typeof zones)[number]; distance: number; header: boolean } | null = null
  for (const container of zones) {
    if (container === panel) continue
    const rect = rectOf(container)
    if (!rect || x < rect.left || x > rect.right) continue
    const distance = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0
    // A stuck window header covers the rows scrolling under it: it wins a tie.
    const header = container.id.toString().startsWith(OPEN_WINDOW_ZONE)
    if (distance <= 8 && (!best || distance < best.distance || (distance === best.distance && header && !best.header))) best = { container, distance, header }
  }
  return best ? [{ id: best.container.id, data: { droppableContainer: best.container, value: best.distance } }] : []
}

/**
 * Where a dragged project or category would go next to a row of its own
 * parent: that row's zone and the side the pointer is on. Null when
 * the drop would move it instead, or not land at all.
 */
function reorderSpot(event: PointerDragEvent): { zone: string; edge: Edge } | null {
  const container = parseContainerDrag(event.active.id)
  const over = event.over
  // Spaces show their new order by moving aside (sortable), not by a line.
  if (!container || container.kind === "space" || !over || !containerReorderTarget(container, over.id.toString())) return null
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
 * A saved tab or group dragged into another list: where it would
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
      const space = useSavedSpacesStore.getState().savedSpaces.find((s) => s.id === container.spaceId)
      const project = container.kind === "space" ? undefined : space?.projects.find((p) => p.id === container.projectId)
      const name = container.kind === "space" ? space?.name
        : container.kind === "project" ? project?.name
        : project?.categories.find((c) => c.id === container.categoryId)?.name
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
    // A project or category only meets the zones that take it.
    const container = activeId === null ? null : parseContainerDrag(activeId)
    if (container) {
      const zones = { ...args, droppableContainers: args.droppableContainers.filter((c) => containerMeets(container, c.id.toString())) }
      const hits = pointerWithin(zones)
      return hits.length > 0 ? hits : rectIntersection(zones)
    }
    if (typeof activeId === "number") {
      // Over Opened Tabs an open tab moves in the browser; it never
      // reaches past the panel into the workspace from there.
      const inPanel = openTabsCollision(args)
      if (inPanel) return inPanel
      const droppableCollisions = rectIntersection({
        ...args,
        droppableContainers: args.droppableContainers.filter((c) =>
          isDropTargetId(c.id.toString()),
        ),
      })
      if (droppableCollisions.length > 0) return droppableCollisions
      return pointerWithin(args)
    }

    // Saved tabs and groups never land in Opened Tabs.
    const allCollisions = pointerWithin({ ...args, droppableContainers: args.droppableContainers.filter((c) => !isOpenTabsZone(c.id.toString())) })
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
  // The reorder spot follows the pointer within a row, so it updates on move too.
  // Where the pointer was when the preview last changed. Moving an item into
  // another list moves the lists around a still pointer, which would point at
  // something else and flip the preview back, and so on (React stopped it with
  // "maximum update depth"). A change waits until the pointer itself moves.
  const settledAt = useRef<{ x: number; y: number } | null>(null)
  const showReorderSpot = (event: PointerDragEvent) => {
    const spot = reorderSpot(event)
    useDropIndicator.getState().show(spot?.zone ?? null, spot?.edge ?? null)
    // A project or category within its own parent: the list shows the new order.
    const container = parseContainerDrag(event.active.id)
    if (container && container.kind !== "space") {
      // Over its own (moved) row the shown order stays, or the list would flip back under a still pointer.
      if (event.over?.id.toString() === containerZone(container, container.kind === "project" ? container.projectId : container.categoryId!)) return
      const next = spot ? containerReorderTarget(container, spot.zone) : null
      const shown: ContainerPreview | null = next && spot ? { kind: container.kind, id: container.kind === "project" ? container.projectId : container.categoryId!, next, edge: spot.edge } : null
      const current = useContainerPreview.getState().preview
      if (shown?.next === current?.next && shown?.edge === current?.edge && shown?.id === current?.id) return
      const now = pointerAt(event)
      const last = settledAt.current
      if (now && last && Math.hypot(now.x - last.x, now.y - last.y) < PREVIEW_SETTLE_PX) return
      settledAt.current = now
      useContainerPreview.getState().show(shown)
      return
    }
    // An open tab in Opened Tabs: shown where it would land, the rows make room.
    const open = openTabPreviewAt(event)
    const shown = useOpenTabPreview.getState().preview
    if (open !== undefined && !(open?.tabId === shown?.tabId && open?.slot.windowId === shown?.slot.windowId && open?.slot.index === shown?.slot.index)) {
      const now = pointerAt(event)
      const last = settledAt.current
      if (!(now && last && Math.hypot(now.x - last.x, now.y - last.y) < PREVIEW_SETTLE_PX)) {
        settledAt.current = now
        useOpenTabPreview.getState().show(open)
      }
    }
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
    useContainerPreview.getState().show(null)
    useSortPreview.getState().show(null)
    useOpenTabPreview.getState().show(null)
    settledAt.current = null
    setDraggedContainer(null)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    const wasDraggingGroup = !!draggedGroup

    stopSpring()
    useDropIndicator.getState().show(null, null)
    const shownOrder = useContainerPreview.getState().preview
    useContainerPreview.getState().show(null)
    const preview = useSortPreview.getState().preview
    useSortPreview.getState().show(null)
    const openPreview = useOpenTabPreview.getState().preview
    useOpenTabPreview.getState().show(null)
    settledAt.current = null
    setActiveId(null)
    setDraggedTab(null)
    setDraggedSavedTab(null)
    setDraggedGroup(null)
    setDraggedContainer(null)

    if (!over && !(shownOrder && parseContainerDrag(active.id))) return

    // An open tab dropped in Opened Tabs moves in the browser, with Undo:
    // to where it was shown, or, if nothing was shown yet, beside the row under it.
    if (typeof active.id === "number" && isOpenTabsZone(over.id.toString())) {
      const open = openPreview?.tabId === active.id ? openPreview : openTabSpot(event)
      const from = active.data?.current as OpenTabDragData | undefined
      if (!open || !from) return
      const undo = await moveOpenTab(active.id, from, open.slot)
      if (undo) showUndoToast(from.windowId === open.slot.windowId ? `Moved “${from.name}”` : `Moved “${from.name}” to ${open.label}`, () => void undo())
      return
    }

    // Dropped while shown in another list: it lands where it was shown.
    if (preview && preview.id === active.id) {
      commitPreview(preview)
      return
    }

    const container = parseContainerDrag(active.id)
    if (container) {
      // Within its parent the drop lands where the list showed it; elsewhere as before.
      const moved = shownOrder && container.kind !== "space"
        ? applyContainerDrop(container, containerZone(container, shownOrder.next), shownOrder.edge)
        : over ? applyContainerDrop(container, over.id.toString(), reorderSpot(event)?.edge) : null
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
