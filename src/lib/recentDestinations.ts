import type { SaveTabsTarget } from "~src/services/saveTabsAsGroup"

/** A category, plus the group last saved into there (if any). */
export type RecentDestination = SaveTabsTarget & { groupId?: string }

/**
 * Where this device last saved tabs to, newest first, one entry per category
 * (remembering the last group used in it). A per-device
 * convenience for the destination picker (not synced, not account data), kept
 * in chrome.storage.local so the popup and the new tab page share it.
 */
export const RECENT_DESTINATIONS_KEY = "flextab_recent_destinations"
export const MAX_RECENT_DESTINATIONS = 3

/**
 * Settings › Saving: "Remember where I last saved" (TASK-75), on until turned
 * off. Off: nothing is remembered (the list is dropped), so nothing is
 * suggested and every save asks where. Per device, like the list itself.
 */
export const REMEMBER_DESTINATIONS_KEY = "flextab_remember_destinations"

export async function loadRememberDestinations(): Promise<boolean> {
  try {
    return (await chrome.storage.local.get(REMEMBER_DESTINATIONS_KEY))[REMEMBER_DESTINATIONS_KEY] !== false
  } catch (_) {
    return true
  }
}

export async function saveRememberDestinations(value: boolean): Promise<void> {
  try {
    await chrome.storage.local.set({ [REMEMBER_DESTINATIONS_KEY]: value })
    if (!value) await chrome.storage.local.remove(RECENT_DESTINATIONS_KEY)
  } catch (_) { /* per-device convenience */ }
}

const sameTarget = (a: RecentDestination, b: RecentDestination) =>
  a.spaceId === b.spaceId && a.projectId === b.projectId && a.categoryId === b.categoryId

function isTarget(v: unknown): v is RecentDestination {
  if (!v || typeof v !== "object") return false
  const t = v as Record<string, unknown>
  return typeof t.spaceId === "string" && typeof t.projectId === "string" && typeof t.categoryId === "string" &&
    (t.groupId === undefined || typeof t.groupId === "string")
}

/** Move `target` to the front, drop duplicates, cap the list. Pure. */
export function pushRecent(list: RecentDestination[], target: RecentDestination, max = MAX_RECENT_DESTINATIONS): RecentDestination[] {
  return [target, ...list.filter((t) => !sameTarget(t, target))].slice(0, max)
}

export async function loadRecentDestinations(): Promise<RecentDestination[]> {
  try {
    if (!(await loadRememberDestinations())) return []
    const stored = (await chrome.storage.local.get(RECENT_DESTINATIONS_KEY))[RECENT_DESTINATIONS_KEY]
    return Array.isArray(stored) ? stored.filter(isTarget) : []
  } catch (_) {
    return []
  }
}

/** Best effort: a failed write only loses the shortcut, never the save. */
export async function rememberDestination(target: RecentDestination): Promise<void> {
  try {
    if (!(await loadRememberDestinations())) return
    const next = pushRecent(await loadRecentDestinations(), {
      spaceId: target.spaceId,
      projectId: target.projectId,
      categoryId: target.categoryId,
      ...(target.groupId ? { groupId: target.groupId } : {}),
    })
    await chrome.storage.local.set({ [RECENT_DESTINATIONS_KEY]: next })
  } catch (_) {
    /* convenience only */
  }
}
