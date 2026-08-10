// DnD domain: tree location, drop-ID protocol, and mutation matrix (FE-B9).
// UI hook stays a thin dnd-kit adapter; keyboard/save can reuse finders/moves.
import { v7 as uuidv7 } from "uuid"
import type { SavedTab, SavedGroup, SavedSpace } from "~src/types"
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore"
import { faviconToDataUrl } from "~src/utils/favicon"
import { ensureSaveTargetPath } from "~src/services/resolveSaveTarget"

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
    id.startsWith("proj-drop:") ||
    id.startsWith("space-drop:")
  )
}

export type BoundaryDropTarget =
  | { kind: "category"; spaceId: string; projectId: string; categoryId: string }
  | { kind: "project"; spaceId: string; projectId: string }
  | { kind: "space"; spaceId: string }

/** Parse cross-boundary drop ids from LeftPanel / ProfilePanel. */
export function parseBoundaryDrop(overId: string): BoundaryDropTarget | null {
  const cat = overId.match(/^cat-drop:(.+):(.+):(.+)$/)
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

/** Active space/project/category from store selection. */
export function getActiveContext() {
  const s = useSavedSpacesStore.getState()
  const spaces = s.savedSpaces
  const currentSpace = spaces.find((sp) => sp.id === s.activeSpaceId)
  const currentProject = currentSpace?.projects.find((p) => p.id === s.activeProjectId)
  const currentCategory = currentProject?.categories.find((c) => c.id === s.activeCategoryId)
  return { spaces, currentSpace, currentProject, currentCategory }
}

async function saveOpenBrowserTab(
  chromeTabId: number,
  spaceId: string,
  projectId: string,
  categoryId: string,
  groupId: string,
  order: number,
) {
  try {
    const tab = await chrome.tabs.get(chromeTabId)
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
  } catch (_) {
    /* Tab closed */
  }
}

/**
 * Apply a completed drag: reorder / cross-group / cross-boundary / save open tab.
 * Reads fresh store state; mutations go through useSavedSpacesStore.
 */
export async function applyDragEnd(args: {
  activeId: string | number
  overId: string
  wasDraggingGroup: boolean
}): Promise<void> {
  const { activeId, overId, wasDraggingGroup } = args
  const { spaces, currentSpace, currentProject, currentCategory } = getActiveContext()
  const store = useSavedSpacesStore.getState()
  const {
    reorderGroups,
    reorderTabsInGroup,
    moveTabBetweenGroups,
    moveGroupToCategory,
    moveTabCrossBoundary,
  } = store

  // --- Cross-boundary drop targets ---
  const boundary = parseBoundaryDrop(overId)
  if (boundary) {
    const tgtSpaceId = boundary.spaceId
    const hintProjectId = boundary.kind === "space" ? undefined : boundary.projectId
    const hintCategoryId = boundary.kind === "category" ? boundary.categoryId : undefined

    const target = ensureSaveTargetPath(tgtSpaceId, {
      projectId: hintProjectId,
      categoryId: hintCategoryId,
    })
    if (!target) return

    // Re-read after ensure may have created nodes
    const freshStore = useSavedSpacesStore.getState()
    const freshSpaces = freshStore.savedSpaces

    if (wasDraggingGroup && typeof activeId === "string") {
      const src = findGroupLocation(freshSpaces, activeId)
      if (!src || src.categoryId === target.categoryId) return
      freshStore.moveGroupToCategory(
        src.spaceId,
        src.projectId,
        src.categoryId,
        activeId,
        tgtSpaceId,
        target.projectId,
        target.categoryId,
      )
      return
    }

    if (typeof activeId === "string" && !wasDraggingGroup) {
      const src = findTabLocation(freshSpaces, activeId)
      if (!src || src.groupId === target.groupId) return
      freshStore.moveTabCrossBoundary(
        src.spaceId,
        src.projectId,
        src.categoryId,
        src.groupId,
        activeId,
        tgtSpaceId,
        target.projectId,
        target.categoryId,
        target.groupId,
      )
      return
    }

    if (typeof activeId === "number") {
      const freshCategory = useSavedSpacesStore
        .getState()
        .savedSpaces.find((s) => s.id === tgtSpaceId)
        ?.projects.find((p) => p.id === target.projectId)
        ?.categories.find((c) => c.id === target.categoryId)
      const tgtGroup = freshCategory?.groups.find((g) => g.id === target.groupId)
      await saveOpenBrowserTab(
        activeId,
        tgtSpaceId,
        target.projectId,
        target.categoryId,
        target.groupId,
        tgtGroup?.tabs.length ?? 0,
      )
      return
    }
    return
  }

  // === Drops within current category context ===
  if (!currentCategory || !currentSpace || !currentProject) return

  const spaceId = currentSpace.id
  const projectId = currentProject.id
  const categoryId = currentCategory.id

  // --- Group reordering (within same category) ---
  if (typeof activeId === "string") {
    const activeGroup = currentCategory.groups.find((g) => g.id === activeId)
    const overGroup = currentCategory.groups.find((g) => g.id === overId)

    if (activeGroup && overGroup && activeId !== overId) {
      const sortedGroups = [...currentCategory.groups].sort(
        (a, b) => (a.order ?? 0) - (b.order ?? 0),
      )
      const fromIndex = sortedGroups.findIndex((g) => g.id === activeId)
      const toIndex = sortedGroups.findIndex((g) => g.id === overId)
      if (fromIndex !== -1 && toIndex !== -1) {
        reorderGroups(spaceId, projectId, categoryId, fromIndex, toIndex)
      }
      return
    }

    // Group from another category dropped onto a group in current category
    if (wasDraggingGroup && !activeGroup && overGroup) {
      const src = findGroupLocation(spaces, activeId)
      if (src) {
        moveGroupToCategory(
          src.spaceId,
          src.projectId,
          src.categoryId,
          activeId,
          spaceId,
          projectId,
          categoryId,
        )
      }
      return
    }
  }

  // --- Drop opened tab onto group droppable ---
  if (typeof activeId === "number") {
    const groupId = parseGroupDroppable(overId)
    if (groupId) {
      const targetGroup = currentCategory.groups.find((g) => g.id === groupId)
      await saveOpenBrowserTab(
        activeId,
        spaceId,
        projectId,
        categoryId,
        groupId,
        targetGroup ? targetGroup.tabs.length : 0,
      )
    }
    return
  }

  // --- Saved tab operations ---
  if (typeof activeId !== "string") return

  const src = findTabLocation(spaces, activeId)
  if (!src) return

  const srcSpace = spaces.find((s) => s.id === src.spaceId)
  const srcProject = srcSpace?.projects.find((p) => p.id === src.projectId)
  const srcCategory = srcProject?.categories.find((c) => c.id === src.categoryId)
  const srcGroup = srcCategory?.groups.find((g) => g.id === src.groupId)
  const draggedTabRef = srcGroup?.tabs.find((t) => t.id === activeId) ?? null
  if (!draggedTabRef) return

  // Case 1: Drop on another saved tab (reorder or cross-group move)
  const dropGroupId = parseGroupDroppable(overId)
  if (!dropGroupId) {
    const tgt = findTabLocation(spaces, overId)
    if (!tgt) return

    if (src.groupId === tgt.groupId) {
      const sortedTabs = [...srcGroup!.tabs].sort(
        (a, b) => (a.order ?? 0) - (b.order ?? 0),
      )
      const fromIndex = sortedTabs.findIndex((tab) => tab.id === activeId)
      const toIndex = sortedTabs.findIndex((tab) => tab.id === overId)
      if (fromIndex !== -1 && toIndex !== -1) {
        reorderTabsInGroup(
          src.spaceId,
          src.projectId,
          src.categoryId,
          src.groupId,
          fromIndex,
          toIndex,
        )
      }
    } else if (
      src.spaceId === tgt.spaceId &&
      src.projectId === tgt.projectId &&
      src.categoryId === tgt.categoryId
    ) {
      const targetGroup = srcCategory!.groups.find((g) => g.id === tgt.groupId)
      if (!targetGroup) return
      const sortedTargetTabs = [...targetGroup.tabs].sort(
        (a, b) => (a.order ?? 0) - (b.order ?? 0),
      )
      const insertIndex = sortedTargetTabs.findIndex((tab) => tab.id === overId)
      moveTabBetweenGroups(
        src.spaceId,
        src.projectId,
        src.categoryId,
        src.groupId,
        tgt.groupId,
        draggedTabRef.id,
        insertIndex,
      )
    } else {
      const tgtSpace = spaces.find((s) => s.id === tgt.spaceId)
      const tgtProject = tgtSpace?.projects.find((p) => p.id === tgt.projectId)
      const tgtCategory = tgtProject?.categories.find((c) => c.id === tgt.categoryId)
      const targetGroup = tgtCategory?.groups.find((g) => g.id === tgt.groupId)
      if (!targetGroup) return
      const sortedTargetTabs = [...targetGroup.tabs].sort(
        (a, b) => (a.order ?? 0) - (b.order ?? 0),
      )
      const insertIndex = sortedTargetTabs.findIndex((tab) => tab.id === overId)
      moveTabCrossBoundary(
        src.spaceId,
        src.projectId,
        src.categoryId,
        src.groupId,
        draggedTabRef.id,
        tgt.spaceId,
        tgt.projectId,
        tgt.categoryId,
        tgt.groupId,
        insertIndex,
      )
    }
  }
  // Case 2: Drop on group droppable zone (append to end)
  else {
    const targetGroupId = dropGroupId
    if (src.groupId === targetGroupId) return

    if (currentCategory?.groups.find((g) => g.id === targetGroupId)) {
      if (src.categoryId === categoryId) {
        moveTabBetweenGroups(
          spaceId,
          projectId,
          categoryId,
          src.groupId,
          targetGroupId,
          draggedTabRef.id,
        )
      } else {
        moveTabCrossBoundary(
          src.spaceId,
          src.projectId,
          src.categoryId,
          src.groupId,
          draggedTabRef.id,
          spaceId,
          projectId,
          categoryId,
          targetGroupId,
        )
      }
    }
  }
}
