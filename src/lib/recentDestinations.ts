import type { SaveTabsTarget } from "~src/services/saveTabsAsGroup"

/**
 * Where this device last saved tabs to, newest first. A per-device
 * convenience for the destination picker (not synced, not account data), kept
 * in chrome.storage.local so the popup and the new tab page share it.
 */
export const RECENT_DESTINATIONS_KEY = "flextab_recent_destinations"
export const MAX_RECENT_DESTINATIONS = 3

const sameTarget = (a: SaveTabsTarget, b: SaveTabsTarget) =>
  a.spaceId === b.spaceId && a.projectId === b.projectId && a.categoryId === b.categoryId

function isTarget(v: unknown): v is SaveTabsTarget {
  if (!v || typeof v !== "object") return false
  const t = v as Record<string, unknown>
  return typeof t.spaceId === "string" && typeof t.projectId === "string" && typeof t.categoryId === "string"
}

/** Move `target` to the front, drop duplicates, cap the list. Pure. */
export function pushRecent(list: SaveTabsTarget[], target: SaveTabsTarget, max = MAX_RECENT_DESTINATIONS): SaveTabsTarget[] {
  return [target, ...list.filter((t) => !sameTarget(t, target))].slice(0, max)
}

export async function loadRecentDestinations(): Promise<SaveTabsTarget[]> {
  try {
    const stored = (await chrome.storage.local.get(RECENT_DESTINATIONS_KEY))[RECENT_DESTINATIONS_KEY]
    return Array.isArray(stored) ? stored.filter(isTarget) : []
  } catch (_) {
    return []
  }
}

/** Best effort: a failed write only loses the shortcut, never the save. */
export async function rememberDestination(target: SaveTabsTarget): Promise<void> {
  try {
    const next = pushRecent(await loadRecentDestinations(), {
      spaceId: target.spaceId,
      projectId: target.projectId,
      categoryId: target.categoryId,
    })
    await chrome.storage.local.set({ [RECENT_DESTINATIONS_KEY]: next })
  } catch (_) {
    /* convenience only */
  }
}
