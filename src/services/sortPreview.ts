// Live preview of a saved tab or group dragged into another container.
// Within one list dnd-kit's sortable moves the rows aside; across
// lists nothing moved, and the drop landed next to whatever was under the
// pointer, unseen. Here the dragged item is shown in the target list while
// dragging, at the spot the drop will use, and the drop commits that spot.

import type { SavedGroup, SavedSpace, SavedTab } from "~src/types"
import { isUnsortedGroup, orderedGroups } from "~src/lib/defaultPath"
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore"
import {
  findGroup, findGroupLocation, findTabLocation, parseGroupDroppable, resolveOverGroupId,
  sameCategory, sortedByOrder, type GroupLocation,
} from "./dragDrop"

export type SortPreview =
  /** A tab shown in group `to` (left out of group `from`), before `beforeId` or last. */
  | { kind: "tab"; id: string; from: string; to: string; beforeId: string | null; item: SavedTab }
  /** A group shown in category `to` (left out of `from`), before `beforeId` or last. */
  | { kind: "group"; id: string; from: string; to: string; toLocation: GroupLocation; beforeId: string | null; item: SavedGroup }

/** The groups a category section lists and sorts (Unsorted sits apart, fixed on top). */
export function userGroups<T extends Pick<SavedGroup, "id" | "config" | "order">>(groups: T[]): T[] {
  return orderedGroups(groups).filter((g) => !isUnsortedGroup(g))
}

/**
 * A saved tab over a tab or the zone of another group. `below`: the pointer is
 * on the lower half of the tab under it, so it goes after that tab.
 */
export function tabPreview(spaces: SavedSpace[], tabId: string, overId: string, below: boolean): SortPreview | null {
  const src = findTabLocation(spaces, tabId)
  const item = src && findGroup(spaces, src, src.groupId)?.tabs.find((t) => t.id === tabId)
  if (!src || !item) return null
  let to = parseGroupDroppable(overId)
  let beforeId: string | null = null
  if (!to) {
    const at = findTabLocation(spaces, overId)
    if (!at) return null
    to = at.groupId
    const tabs = sortedByOrder(findGroup(spaces, at, at.groupId)!.tabs)
    beforeId = below ? tabs[tabs.findIndex((t) => t.id === overId) + 1]?.id ?? null : overId
  }
  if (to === src.groupId || !findGroupLocation(spaces, to)) return null
  return { kind: "tab", id: tabId, from: src.groupId, to, beforeId, item }
}

/**
 * A group over a group, a tab or an empty section of another category. Over a
 * group card or its zone, `below` puts it after that group; over a tab inside
 * one, before that group; over Unsorted or an empty section, last (as the drop
 * there always did).
 */
export function groupPreview(spaces: SavedSpace[], groupId: string, overId: string, below: boolean): SortPreview | null {
  const src = findGroupLocation(spaces, groupId)
  const item = src && findGroup(spaces, src, groupId)
  if (!src || !item || isUnsortedGroup(item)) return null
  let to: GroupLocation | null = null
  let beforeId: string | null = null
  const section = overId.match(/^section-drop:(.+):(.+):(.+)$/)
  if (section) {
    to = { spaceId: section[1], projectId: section[2], categoryId: section[3] }
  } else {
    const overGroupId = resolveOverGroupId(spaces, overId)
    to = overGroupId ? findGroupLocation(spaces, overGroupId) : null
    if (!to || !overGroupId) return null
    const overGroup = findGroup(spaces, to, overGroupId)!
    if (!isUnsortedGroup(overGroup)) {
      const onCard = overId === overGroupId || parseGroupDroppable(overId) === overGroupId
      const groups = userGroups(categoryAt(spaces, to)!.groups)
      beforeId = onCard && below ? groups[groups.findIndex((g) => g.id === overGroupId) + 1]?.id ?? null : overGroupId
    }
  }
  if (sameCategory(src, to) || !categoryAt(spaces, to)) return null
  return { kind: "group", id: groupId, from: src.categoryId, to: to.categoryId, toLocation: to, beforeId, item }
}

function categoryAt(spaces: SavedSpace[], loc: GroupLocation) {
  return spaces.find((s) => s.id === loc.spaceId)?.projects.find((p) => p.id === loc.projectId)
    ?.categories.find((c) => c.id === loc.categoryId)
}

/** A list as it shows during the preview: the item left out of its old list, put in its new one. */
export function withPreview<T extends { id: string }>(list: T[], container: string, kind: SortPreview["kind"], preview: SortPreview | null): T[] {
  if (!preview || preview.kind !== kind) return list
  if (container !== preview.from && container !== preview.to) return list
  const rest = list.filter((x) => x.id !== preview.id)
  if (container !== preview.to) return rest
  const at = preview.beforeId ? rest.findIndex((x) => x.id === preview.beforeId) : -1
  const index = at < 0 ? rest.length : at
  return [...rest.slice(0, index), preview.item as unknown as T, ...rest.slice(index)]
}

/** Drop where the preview showed it. */
export function commitPreview(preview: SortPreview): void {
  const store = useSavedSpacesStore.getState()
  const spaces = store.savedSpaces
  if (preview.kind === "tab") {
    const src = findTabLocation(spaces, preview.id)
    const tgt = findGroupLocation(spaces, preview.to)
    if (!src || !tgt) return
    const tabs = sortedByOrder(findGroup(spaces, tgt, preview.to)!.tabs)
    const at = preview.beforeId ? tabs.findIndex((t) => t.id === preview.beforeId) : -1
    const index = at < 0 ? tabs.length : at
    if (sameCategory(src, tgt)) {
      store.moveTabBetweenGroups(src.spaceId, src.projectId, src.categoryId, src.groupId, preview.to, preview.id, index)
    } else {
      store.moveTabCrossBoundary(src.spaceId, src.projectId, src.categoryId, src.groupId, preview.id,
        tgt.spaceId, tgt.projectId, tgt.categoryId, preview.to, index)
    }
    return
  }
  const src = findGroupLocation(spaces, preview.id)
  const tgt = preview.toLocation
  if (!src || !categoryAt(spaces, tgt)) return
  store.moveGroupToCategory(src.spaceId, src.projectId, src.categoryId, preview.id, tgt.spaceId, tgt.projectId, tgt.categoryId)
  if (!preview.beforeId) return // it lands last
  const sorted = sortedByOrder(categoryAt(useSavedSpacesStore.getState().savedSpaces, tgt)!.groups)
  const from = sorted.findIndex((g) => g.id === preview.id)
  const to = sorted.findIndex((g) => g.id === preview.beforeId)
  if (from >= 0 && to >= 0) store.reorderGroups(tgt.spaceId, tgt.projectId, tgt.categoryId, from, to)
}
