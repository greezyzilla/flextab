// DnD domain: tree location, drop-ID protocol, and mutation matrix (FE-B9).
import { savedElsewhere } from "~src/lib/savedUrlIndex"
// UI hook stays a thin dnd-kit adapter; keyboard/save can reuse finders/moves.
import { v7 as uuidv7 } from "uuid"
import type { SavedTab, SavedGroup, SavedSpace } from "~src/types"
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore"
import { faviconToDataUrl } from "~src/utils/favicon"
import { isSavableTabUrl } from "~src/services/saveTabsAsGroup"
import { ensureSaveTargetPath } from "~src/services/resolveSaveTarget"
import { ensureCategoryPath, isUnsortedGroup } from "~src/lib/defaultPath"
import * as yjs from "~src/lib/yjsDoc"

export type TabLocation = {
  spaceId: string
  projectId: string
  categoryId: string
  groupId: string
}

export type GroupLocation = {
  spaceId: string
  projectId: string
  categoryId: string
}

/** Locate a tab across all spaces/projects/categories. */
export function findTabLocation(spaces: SavedSpace[], tabId: string): TabLocation | null {
  for (const space of spaces) {
    for (const project of space.projects) {
      for (const category of project.categories) {
        for (const group of category.groups) {
          if (group.tabs.find((t) => t.id === tabId)) {
            return {
              spaceId: space.id,
              projectId: project.id,
              categoryId: category.id,
              groupId: group.id,
            }
          }
        }
      }
    }
  }
  return null
}

/** Locate a group across all spaces/projects/categories. */
export function findGroupLocation(spaces: SavedSpace[], groupId: string): GroupLocation | null {
  for (const space of spaces) {
    for (const project of space.projects) {
      for (const category of project.categories) {
        if (category.groups.find((g) => g.id === groupId)) {
          return {
            spaceId: space.id,
            projectId: project.id,
            categoryId: category.id,
          }
        }
      }
    }
  }
  return null
}

/** Resolve overlay payload for a saved-item drag (group or tab). */
export function findSavedDragItem(
  spaces: SavedSpace[],
  id: string,
): { group: SavedGroup | null; tab: SavedTab | null } {
  for (const space of spaces) {
    for (const project of space.projects) {
      for (const category of project.categories) {
        const group = category.groups.find((g) => g.id === id)
        if (group) return { group, tab: null }
        for (const g of category.groups) {
          const tab = g.tabs.find((t) => t.id === id)
          if (tab) return { group: null, tab }
        }
      }
    }
  }
  return { group: null, tab: null }
}

/** True for droppable zones (not sortable item ids). */
export function isDropTargetId(id: string): boolean {
  return (
    id.startsWith("droppable-") ||
    id.startsWith("cat-drop:") ||
    id.startsWith("section-drop:") ||
    id.startsWith("proj-drop:") ||
    id.startsWith("space-drop:")
  )
}

export type BoundaryDropTarget =
  | { kind: "category"; spaceId: string; projectId: string; categoryId: string }
  | { kind: "project"; spaceId: string; projectId: string }
  | { kind: "space"; spaceId: string }

/**
 * Parse cross-boundary drop ids from LeftPanel / ProfilePanel, plus the
 * project page's category sections (`section-drop:`), which behave like a
 * category drop but need their own id (dnd-kit ids must be unique).
 */
export function parseBoundaryDrop(overId: string): BoundaryDropTarget | null {
  const cat = overId.match(/^(?:cat|section)-drop:(.+):(.+):(.+)$/)
  if (cat) {
    return {
      kind: "category",
      spaceId: cat[1],
      projectId: cat[2],
      categoryId: cat[3],
    }
  }
  const proj = overId.match(/^proj-drop:(.+):(.+)$/)
  if (proj) {
    return { kind: "project", spaceId: proj[1], projectId: proj[2] }
  }
  const space = overId.match(/^space-drop:(.+)$/)
  if (space) {
    return { kind: "space", spaceId: space[1] }
  }
  return null
}

/** Group zone id from TabGroup (`droppable-${groupId}`). */
export function parseGroupDroppable(overId: string): string | null {
  if (!overId.startsWith("droppable-")) return null
  return overId.slice("droppable-".length)
}

async function saveOpenBrowserTab(
  tab: chrome.tabs.Tab,
  spaceId: string,
  projectId: string,
  categoryId: string,
  groupId: string,
  order: number,
): Promise<string[]> {
  // Other places this URL is already saved, read before saving (TASK-4).
  const alsoIn = savedElsewhere(useSavedSpacesStore.getState().savedSpaces, [tab.url], groupId).map((l) => l.path)
  const favicon = await faviconToDataUrl(tab.favIconUrl || "")
  const savedTab: SavedTab = {
    id: uuidv7(),
    url: tab.url || "",
    title: tab.title || "Untitled",
    favicon,
    order,
  }
  useSavedSpacesStore
    .getState()
    .addSavedTab(spaceId, projectId, categoryId, groupId, savedTab)
  return alsoIn
}

function sortedByOrder<T extends { order?: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

function findGroup(spaces: SavedSpace[], loc: GroupLocation, groupId: string): SavedGroup | undefined {
  return spaces
    .find((s) => s.id === loc.spaceId)
    ?.projects.find((p) => p.id === loc.projectId)
    ?.categories.find((c) => c.id === loc.categoryId)
    ?.groups.find((g) => g.id === groupId)
}

function sameCategory(a: GroupLocation, b: GroupLocation): boolean {
  return a.spaceId === b.spaceId && a.projectId === b.projectId && a.categoryId === b.categoryId
}

/** The group an over-id points at: a group zone, a group card, or a tab inside one. */
export function resolveOverGroupId(spaces: SavedSpace[], overId: string): string | null {
  const zone = parseGroupDroppable(overId)
  if (zone) return zone
  if (findGroupLocation(spaces, overId)) return overId
  return findTabLocation(spaces, overId)?.groupId ?? null
}

/**
 * Apply a completed drag: reorder / cross-group / cross-boundary / save open tab.
 * Reads fresh store state; mutations go through useSavedSpacesStore.
 *
 * Every saved group on screen can be a target (the project page shows all of
 * a project's categories at once), so targets are located in the tree rather
 * than assumed to be in the active category.
 *
 * A drop onto a space / project / category always lands (TASK-20): missing
 * levels get default items and tabs go to that category's Unsorted group.
 * Returns `{ unsavable }` when an open tab isn't a savable web page (checked
 * before anything is created, so a rejected drop leaves nothing behind).
 */
export type DropOutcome = { unsavable: string } | { alsoIn: string[] } | void

export async function applyDragEnd(args: {
  activeId: string | number
  overId: string
  wasDraggingGroup: boolean
}): Promise<DropOutcome> {
  const { activeId, overId } = args

  let openTab: chrome.tabs.Tab | null = null
  if (typeof activeId === "number") {
    openTab = await chrome.tabs.get(activeId).catch(() => null)
    if (!openTab) return // closed while dragging
    if (!isSavableTabUrl(openTab.url)) return { unsavable: openTab.title || openTab.url || "This page" }
  }

  const store = useSavedSpacesStore.getState()
  const spaces = store.savedSpaces
  const draggingGroup =
    args.wasDraggingGroup || (typeof activeId === "string" && !!findGroupLocation(spaces, activeId))
  // Unsorted is a fixed system group: it is never dragged itself.
  if (draggingGroup && typeof activeId === "string") {
    const loc = findGroupLocation(spaces, activeId)
    if (loc && isUnsortedGroup(findGroup(spaces, loc, activeId))) return
  }

  // --- Cross-boundary drop targets (sidebar, rail, project-page sections) ---
  const boundary = parseBoundaryDrop(overId)
  if (boundary) {
    const tgtSpaceId = boundary.spaceId
    const hintProjectId = boundary.kind === "space" ? undefined : boundary.projectId
    const hintCategoryId = boundary.kind === "category" ? boundary.categoryId : undefined

    // A group only needs a category (no Unsorted is created for it).
    if (draggingGroup && typeof activeId === "string") {
      const ids = ensureCategoryPath(tgtSpaceId, { projectId: hintProjectId, categoryId: hintCategoryId })
      if (!ids) return
      const src = findGroupLocation(spaces, activeId)
      if (!src || sameCategory(src, ids)) return
      store.moveGroupToCategory(
        src.spaceId, src.projectId, src.categoryId, activeId,
        ids.spaceId, ids.projectId, ids.categoryId,
      )
      return
    }

    const target = ensureSaveTargetPath(tgtSpaceId, {
      projectId: hintProjectId,
      categoryId: hintCategoryId,
    })
    if (!target) return

    // Re-read from the doc: ensure may have created levels and the Unsorted group.
    const fresh = useSavedSpacesStore.getState()
    const freshSpaces = yjs.getSpaces()

    if (typeof activeId === "string") {
      const src = findTabLocation(freshSpaces, activeId)
      if (!src || src.groupId === target.groupId) return
      fresh.moveTabCrossBoundary(
        src.spaceId, src.projectId, src.categoryId, src.groupId, activeId,
        tgtSpaceId, target.projectId, target.categoryId, target.groupId,
      )
      return
    }

    const tgtGroup = findGroup(freshSpaces, target, target.groupId)
    const alsoIn = await saveOpenBrowserTab(
      openTab!, tgtSpaceId, target.projectId, target.categoryId, target.groupId,
      tgtGroup?.tabs.length ?? 0,
    )
    return alsoIn.length ? { alsoIn } : undefined
  }

  // --- Group dropped on a group (or a tab inside it): reorder or re-file ---
  if (draggingGroup && typeof activeId === "string") {
    const overGroupId = resolveOverGroupId(spaces, overId)
    if (!overGroupId || overGroupId === activeId) return
    const src = findGroupLocation(spaces, activeId)
    const tgt = findGroupLocation(spaces, overGroupId)
    if (!src || !tgt) return

    if (!sameCategory(src, tgt)) {
      store.moveGroupToCategory(
        src.spaceId, src.projectId, src.categoryId, activeId,
        tgt.spaceId, tgt.projectId, tgt.categoryId,
      )
    }
    // Unsorted stays first: a drop on it only re-files, never reorders.
    if (isUnsortedGroup(findGroup(spaces, tgt, overGroupId))) return
    // Land at the position of the group it was dropped on.
    const category = useSavedSpacesStore
      .getState()
      .savedSpaces.find((s) => s.id === tgt.spaceId)
      ?.projects.find((p) => p.id === tgt.projectId)
      ?.categories.find((c) => c.id === tgt.categoryId)
    if (!category) return
    const sorted = sortedByOrder(category.groups)
    const fromIndex = sorted.findIndex((g) => g.id === activeId)
    const toIndex = sorted.findIndex((g) => g.id === overGroupId)
    if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
      store.reorderGroups(tgt.spaceId, tgt.projectId, tgt.categoryId, fromIndex, toIndex)
    }
    return
  }

  // --- Drop opened tab onto a group zone ---
  if (openTab) {
    const groupId = parseGroupDroppable(overId)
    if (!groupId) return
    const loc = findGroupLocation(spaces, groupId)
    if (!loc) return
    const alsoIn = await saveOpenBrowserTab(
      openTab, loc.spaceId, loc.projectId, loc.categoryId, groupId,
      findGroup(spaces, loc, groupId)?.tabs.length ?? 0,
    )
    return alsoIn.length ? { alsoIn } : undefined
  }

  // --- Saved tab operations ---
  if (typeof activeId !== "string") return
  const src = findTabLocation(spaces, activeId)
  if (!src) return
  const srcGroup = findGroup(spaces, src, src.groupId)
  const draggedTabRef = srcGroup?.tabs.find((t) => t.id === activeId)
  if (!srcGroup || !draggedTabRef) return

  const dropGroupId = parseGroupDroppable(overId)

  // Case 1: dropped on another saved tab (reorder or move next to it)
  if (!dropGroupId) {
    const tgt = findTabLocation(spaces, overId)
    if (!tgt) return

    if (src.groupId === tgt.groupId) {
      const sortedTabs = sortedByOrder(srcGroup.tabs)
      const fromIndex = sortedTabs.findIndex((tab) => tab.id === activeId)
      const toIndex = sortedTabs.findIndex((tab) => tab.id === overId)
      if (fromIndex !== -1 && toIndex !== -1) {
        store.reorderTabsInGroup(src.spaceId, src.projectId, src.categoryId, src.groupId, fromIndex, toIndex)
      }
      return
    }

    const targetGroup = findGroup(spaces, tgt, tgt.groupId)
    if (!targetGroup) return
    const insertIndex = sortedByOrder(targetGroup.tabs).findIndex((tab) => tab.id === overId)
    if (sameCategory(src, tgt)) {
      store.moveTabBetweenGroups(
        src.spaceId, src.projectId, src.categoryId, src.groupId, tgt.groupId,
        draggedTabRef.id, insertIndex,
      )
    } else {
      store.moveTabCrossBoundary(
        src.spaceId, src.projectId, src.categoryId, src.groupId, draggedTabRef.id,
        tgt.spaceId, tgt.projectId, tgt.categoryId, tgt.groupId, insertIndex,
      )
    }
    return
  }

  // Case 2: dropped on a group zone (append to end)
  if (src.groupId === dropGroupId) return
  const tgt = findGroupLocation(spaces, dropGroupId)
  if (!tgt) return
  if (sameCategory(src, tgt)) {
    store.moveTabBetweenGroups(
      src.spaceId, src.projectId, src.categoryId, src.groupId, dropGroupId, draggedTabRef.id,
    )
  } else {
    store.moveTabCrossBoundary(
      src.spaceId, src.projectId, src.categoryId, src.groupId, draggedTabRef.id,
      tgt.spaceId, tgt.projectId, tgt.categoryId, dropGroupId,
    )
  }
}
