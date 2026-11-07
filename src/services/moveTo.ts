import { v7 as uuidv7 } from "uuid"
import type { PickerValue } from "~src/components/DestinationPicker"
import type { GroupLocation } from "~src/services/dragDrop"
import { ensureUnsortedGroup, firstGroupOrder } from "~src/lib/defaultPath"
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore"

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
