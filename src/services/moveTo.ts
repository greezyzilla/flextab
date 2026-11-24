import { v7 as uuidv7 } from "uuid"
import type { PickerValue } from "~src/components/DestinationPicker"
import type { GroupLocation } from "~src/services/dragDrop"
import { ensureUnsortedGroup, firstGroupOrder } from "~src/lib/defaultPath"
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore"
import { doc } from "~src/lib/yjsDoc"

function findCategory(t: { spaceId: string; projectId: string; categoryId: string }) {
  return useSavedSpacesStore.getState().savedSpaces.find((s) => s.id === t.spaceId)
    ?.projects.find((p) => p.id === t.projectId)
    ?.categories.find((c) => c.id === t.categoryId)
}

/**
 * The group a "Move to…" or "Save to…" lands in: the picked group, a new
 * named group (created first, at the top), or the category's Unsorted.
 */
export function resolvePickedGroup(target: PickerValue): string | null {
  const category = findCategory(target)
  if (!category) return null
  if (target.groupId && category.groups.some((g) => g.id === target.groupId)) return target.groupId
  if (target.newGroupName?.trim()) {
    const id = uuidv7()
    useSavedSpacesStore.getState().addSavedGroup(target.spaceId, target.projectId, target.categoryId, {
      id, name: target.newGroupName.trim(), tabs: [], order: firstGroupOrder(category.groups),
    })
    return id
  }
  return ensureUnsortedGroup(target)
}

/** Move a saved tab to the picked group (TASK-5, the non-drag alternative). */
export function moveTabTo(from: GroupLocation & { groupId: string }, tabId: string, target: PickerValue): void {
  const groupId = resolvePickedGroup(target)
  if (!groupId || groupId === from.groupId) return
  const store = useSavedSpacesStore.getState()
  const sameCategory = from.spaceId === target.spaceId && from.projectId === target.projectId && from.categoryId === target.categoryId
  if (sameCategory) {
    store.moveTabBetweenGroups(from.spaceId, from.projectId, from.categoryId, from.groupId, groupId, tabId)
  } else {
    store.moveTabCrossBoundary(from.spaceId, from.projectId, from.categoryId, from.groupId, tabId, target.spaceId, target.projectId, target.categoryId, groupId)
  }
}

/** Move a group to the picked category (TASK-5, the non-drag alternative). */
export function moveGroupTo(from: GroupLocation, groupId: string, target: PickerValue): void {
  if (!findCategory(target)) return
  if (from.spaceId === target.spaceId && from.projectId === target.projectId && from.categoryId === target.categoryId) return
  useSavedSpacesStore.getState().moveGroupToCategory(
    from.spaceId, from.projectId, from.categoryId, groupId, target.spaceId, target.projectId, target.categoryId,
  )
}

/** The item after `id` in `list`, else the one before it: what stays selected when `id` leaves. */
function neighbourId(list: { id: string }[], id: string): string | null {
  const i = list.findIndex((x) => x.id === id)
  return (list[i + 1] ?? list[i - 1])?.id ?? null
}

/**
 * Move a project to the end of another space (TASK-59). If it was the open
 * project, the one next to it opens instead, so the view stays in this space.
 * Returns an undo that puts it back at its old position, or null when nothing
 * moved (same space, or the project or the space is gone).
 */
export function moveProjectTo(fromSpaceId: string, projectId: string, toSpaceId: string): (() => void) | null {
  const store = useSavedSpacesStore.getState()
  const from = store.savedSpaces.find((s) => s.id === fromSpaceId)
  const index = from?.projects.findIndex((p) => p.id === projectId) ?? -1
  if (!from || index < 0 || fromSpaceId === toSpaceId || !store.savedSpaces.some((s) => s.id === toSpaceId)) return null
  const wasOpen = store.activeSpaceId === fromSpaceId && store.activeProjectId === projectId
  const next = wasOpen ? neighbourId(from.projects, projectId) : null
  store.moveProjectToSpace(fromSpaceId, projectId, toSpaceId)
  if (wasOpen) store.setActiveProject(next)
  return () => {
    const now = useSavedSpacesStore.getState()
    const home = now.savedSpaces.find((s) => s.id === fromSpaceId)
    if (!home || !now.savedSpaces.find((s) => s.id === toSpaceId)?.projects.some((p) => p.id === projectId)) return
    // One edit: back to the end of its old space, then to its old position.
    doc.transact(() => {
      now.moveProjectToSpace(toSpaceId, projectId, fromSpaceId)
      now.reorderProjects(fromSpaceId, home.projects.length, Math.min(index, home.projects.length))
    })
  }
}

/**
 * Move a category to the end of another project, in any space (TASK-59). If it
 * was the open category, the one next to it opens instead. Returns an undo, or
 * null when nothing moved.
 */
export function moveCategoryTo(
  from: { spaceId: string; projectId: string }, categoryId: string, to: { spaceId: string; projectId: string },
): (() => void) | null {
  const store = useSavedSpacesStore.getState()
  const project = (t: { spaceId: string; projectId: string }) =>
    useSavedSpacesStore.getState().savedSpaces.find((s) => s.id === t.spaceId)?.projects.find((p) => p.id === t.projectId)
  const source = project(from)
  const index = source?.categories.findIndex((c) => c.id === categoryId) ?? -1
  if (!source || index < 0 || !project(to) || (from.spaceId === to.spaceId && from.projectId === to.projectId)) return null
  const wasOpen = store.activeProjectId === from.projectId && store.activeCategoryId === categoryId
  const next = wasOpen ? neighbourId(source.categories, categoryId) : null
  store.moveCategoryToProject(from.spaceId, from.projectId, categoryId, to.spaceId, to.projectId)
  if (wasOpen) store.setActiveCategory(next)
  return () => {
    const home = project(from)
    if (!home || !project(to)?.categories.some((c) => c.id === categoryId)) return
    const now = useSavedSpacesStore.getState()
    doc.transact(() => {
      now.moveCategoryToProject(to.spaceId, to.projectId, categoryId, from.spaceId, from.projectId)
      now.reorderCategories(from.spaceId, from.projectId, home.categories.length, Math.min(index, home.categories.length))
    })
  }
}

/** Where a project or category is moved to: a space, or a project in any space. */
export type ContainerTarget = { spaceId: string; projectId?: string }

/** "Personal" for a space, "Personal › Site" for a project: where a moved container now lives. */
export function describeContainerTarget(t: ContainerTarget): string {
  const space = useSavedSpacesStore.getState().savedSpaces.find((s) => s.id === t.spaceId)
  const project = t.projectId ? space?.projects.find((p) => p.id === t.projectId) : undefined
  return [space?.name, project?.name].filter(Boolean).join(" › ")
}

// --- Order within a parent (TASK-64) ---

export type Edge = "before" | "after"

/** Where the item at `from` ends up when put before/after the item at `target` (indexes in one list). */
export function insertionIndex(from: number, target: number, edge: Edge): number {
  const slot = edge === "before" ? target : target + 1
  return from < slot ? slot - 1 : slot
}

function projectsOf(spaceId: string) {
  return useSavedSpacesStore.getState().savedSpaces.find((s) => s.id === spaceId)?.projects
}
function categoriesOf(spaceId: string, projectId: string) {
  return projectsOf(spaceId)?.find((p) => p.id === projectId)?.categories
}

/**
 * Move a project or category from one index to another in its own list, or
 * do nothing (returns null) when it stays put. Returns an undo.
 */
function reorderWithin(list: { id: string }[] | undefined, id: string, to: (from: number) => number, apply: (from: number, to: number) => void): (() => void) | null {
  const from = list?.findIndex((x) => x.id === id) ?? -1
  if (!list || from < 0) return null
  const index = to(from)
  if (index === from || index < 0 || index >= list.length) return null
  apply(from, index)
  return () => apply(index, from)
}

/** "Move up" / "Move down" for a project (TASK-64): one place, nothing at either end. */
export function shiftProject(spaceId: string, projectId: string, by: -1 | 1): boolean {
  return !!reorderWithin(projectsOf(spaceId), projectId, (i) => i + by,
    (a, b) => useSavedSpacesStore.getState().reorderProjects(spaceId, a, b))
}

/** "Move up" / "Move down" for a category within its project (TASK-64). */
export function shiftCategory(spaceId: string, projectId: string, categoryId: string, by: -1 | 1): boolean {
  return !!reorderWithin(categoriesOf(spaceId, projectId), categoryId, (i) => i + by,
    (a, b) => useSavedSpacesStore.getState().reorderCategories(spaceId, projectId, a, b))
}

/** Drop a project before/after another one in the same space (TASK-64). Returns an undo, or null when nothing changed. */
export function placeProject(spaceId: string, projectId: string, targetId: string, edge: Edge): (() => void) | null {
  const list = projectsOf(spaceId)
  const target = list?.findIndex((p) => p.id === targetId) ?? -1
  if (target < 0) return null
  return reorderWithin(list, projectId, (from) => insertionIndex(from, target, edge),
    (a, b) => useSavedSpacesStore.getState().reorderProjects(spaceId, a, b))
}

/** Drop a rail space before/after another one (TASK-66). Returns an undo, or null when nothing changed. */
export function placeSpace(spaceId: string, targetId: string, edge: Edge): (() => void) | null {
  const list = useSavedSpacesStore.getState().savedSpaces
  const target = list.findIndex((s) => s.id === targetId)
  if (target < 0) return null
  return reorderWithin(list, spaceId, (from) => insertionIndex(from, target, edge),
    (a, b) => useSavedSpacesStore.getState().reorderSpaces(a, b))
}

/** Drop a category before/after another one in the same project (TASK-64). Returns an undo, or null when nothing changed. */
export function placeCategory(spaceId: string, projectId: string, categoryId: string, targetId: string, edge: Edge): (() => void) | null {
  const list = categoriesOf(spaceId, projectId)
  const target = list?.findIndex((c) => c.id === targetId) ?? -1
  if (target < 0) return null
  return reorderWithin(list, categoryId, (from) => insertionIndex(from, target, edge),
    (a, b) => useSavedSpacesStore.getState().reorderCategories(spaceId, projectId, a, b))
}
