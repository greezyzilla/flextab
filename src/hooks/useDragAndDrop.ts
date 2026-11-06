import { useState } from "react"
import { rectIntersection, pointerWithin } from "@dnd-kit/core"
import type { DragStartEvent, DragEndEvent, CollisionDetection } from "@dnd-kit/core"
import type { SavedTab, SavedGroup } from "~src/types"
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore"
import {
  applyDragEnd,
  findSavedDragItem,
  isDropTargetId,
} from "~src/services/dragDrop"
import { requestMissingLevel } from "~src/lib/structurePrompts"
import { toast } from "sonner"

/**
 * Thin dnd-kit adapter (FE-B9). Domain mutations live in services/dragDrop.
 */
export function useDragAndDrop() {
  const [activeId, setActiveId] = useState<string | number | null>(null)
  const [draggedTab, setDraggedTab] = useState<chrome.tabs.Tab | null>(null)
  const [draggedSavedTab, setDraggedSavedTab] = useState<SavedTab | null>(null)
  const [draggedGroup, setDraggedGroup] = useState<SavedGroup | null>(null)

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

    const { group, tab } = findSavedDragItem(
      useSavedSpacesStore.getState().savedSpaces,
      active.id as string,
    )
    if (group) setDraggedGroup(group)
    else if (tab) setDraggedSavedTab(tab)
  }

  const collisionDetectionStrategy: CollisionDetection = (args) => {
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

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    const wasDraggingGroup = !!draggedGroup

    setActiveId(null)
    setDraggedTab(null)
    setDraggedSavedTab(null)
    setDraggedGroup(null)

    if (!over) return

    const args = {
      activeId: active.id as string | number,
      overId: over.id.toString(),
      wasDraggingGroup,
    }
    const outcome = await applyDragEnd(args)
    if (!outcome) return
    if ("unsavable" in outcome) {
      toast(`Can't save “${outcome.unsavable}”`, {
        description: "Only web pages (http/https) can be saved. Browser, extension and local file pages are skipped.",
      })
      return
    }
    // Dropped into a space/project with no category yet: ask the user to name
    // it, then finish the same drop instead of making them repeat it.
    requestMissingLevel(outcome, () => { void applyDragEnd(args) })
  }

  return {
    handleDragStart,
    handleDragEnd,
    collisionDetectionStrategy,
    activeId,
    draggedTab,
    draggedSavedTab,
    draggedGroup,
  }
}
