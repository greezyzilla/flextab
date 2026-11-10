import { useEffect, useRef, useState } from "react"
import { describeAlsoSaved } from "~src/lib/savedUrlIndex"
import { rectIntersection, pointerWithin } from "@dnd-kit/core"
import type { DragStartEvent, DragEndEvent, DragOverEvent, CollisionDetection } from "@dnd-kit/core"
import type { SavedTab, SavedGroup } from "~src/types"
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore"
import {
  applyContainerDrop,
  applyDragEnd,
  containerMeets,
  findSavedDragItem,
  isDropTargetId,
  parseBoundaryDrop,
  parseContainerDrag,
  type ContainerDrag,
} from "~src/services/dragDrop"
import { toast } from "sonner"
import { showUndoToast } from "~src/components/ui/sonner"

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
  const handleDragOver = (event: DragOverEvent) => {
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
    setDraggedContainer(null)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    const wasDraggingGroup = !!draggedGroup

    stopSpring()
    setActiveId(null)
    setDraggedTab(null)
    setDraggedSavedTab(null)
    setDraggedGroup(null)
    setDraggedContainer(null)

    if (!over) return

    const container = parseContainerDrag(active.id)
    if (container) {
      const moved = applyContainerDrop(container, over.id.toString())
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
    } else if (outcome && "alsoIn" in outcome) {
      const notice = describeAlsoSaved(outcome.alsoIn)
      if (notice) toast(notice)
    }
  }

  return {
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragCancel,
    collisionDetectionStrategy,
    activeId,
    draggedTab,
    draggedSavedTab,
    draggedGroup,
    draggedContainer,
  }
}
