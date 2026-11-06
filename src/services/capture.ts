// Shared capture service (TASK-2): the one write path for "save these open
// tabs" from the popup, the new tab page and the background service worker
// (keyboard command, right-click menu). It writes straight to the Yjs doc of
// whatever context it runs in and persists before returning, so a caller can
// acknowledge "Saved" only once the write is durable.
import { v7 as uuidv7 } from "uuid"
import * as yjs from "~src/lib/yjsDoc"
import { rememberDestination, loadRecentDestinations, type RecentDestination } from "~src/lib/recentDestinations"
import { isSavableTabUrl, toSavedTabs, defaultSavedGroupName } from "~src/services/saveTabsAsGroup"
import { resolveSaveTargetIds, NEW_GROUP_NAME } from "~src/services/resolveSaveTarget"
import type { SavedSpace, SavedTab } from "~src/types"

export type ChromeTabLike = { id?: number; url?: string; title?: string; favIconUrl?: string; pinned?: boolean; windowId?: number; index?: number }

/** Where to capture: a category plus an existing group, or a new group to create. */
export type CaptureDestination = {
  spaceId: string
  projectId: string
  categoryId: string
  /** Existing group to append to. Absent (or gone) → a new group is created. */
  groupId?: string
  /** Name for a newly created group. */
  newGroupName?: string
}

export type ClosedTab = { windowId: number; index: number; url: string }

/** What a capture did, enough to Undo it or move it (Change). */
export type CaptureReceipt = {
  target: { spaceId: string; projectId: string; categoryId: string; groupId: string }
  /** Ids of the SavedTabs this capture added. */
  tabIds: string[]
  /** True if this capture created the group (Undo/Change then removes it when empty). */
  createdGroup: boolean
  /** Tabs not added because the same URL is already in the group. */
  duplicates: number
  /** Tabs skipped because they aren't savable web pages. */
  skipped: number
  /** Browser tabs closed after saving ("Close after saving"), for Undo to reopen. */
  closed: ClosedTab[]
  /** False if the write is in this context's doc but storage refused it: retry with `persistCapture`. */
  persisted: boolean
  at: number
}

export type CaptureFailure = { error: "no-destination" | "nothing-savable"; skipped: number }

export function isCaptureFailure(r: CaptureReceipt | CaptureFailure): r is CaptureFailure {
  return "error" in r
}

const normalizeUrl = (url: string) => url.replace(/\/$/, "")

function findCategory(spaces: SavedSpace[], d: { spaceId: string; projectId: string; categoryId: string }) {
  return spaces.find((s) => s.id === d.spaceId)
    ?.projects.find((p) => p.id === d.projectId)
    ?.categories.find((c) => c.id === d.categoryId)
}

/**
 * Save `tabs` into the destination. Unsavable pages are skipped; with
 * `dedupe`, URLs already in the target group are not added again (a receipt
 * with no tabIds and `duplicates > 0` means "already saved there").
 */
export async function captureTabs(
  tabs: ChromeTabLike[],
  destination: CaptureDestination,
  opts: { dedupe?: boolean } = {},
): Promise<CaptureReceipt | CaptureFailure> {
  const savable = tabs.filter((t) => isSavableTabUrl(t.url))
  const skipped = tabs.length - savable.length
  if (savable.length === 0) return { error: "nothing-savable", skipped }

  const category = findCategory(yjs.getSpaces(), destination)
  if (!category) return { error: "no-destination", skipped }

  const existing = destination.groupId ? category.groups.find((g) => g.id === destination.groupId) : undefined
  const already = new Set((existing?.tabs ?? []).map((t) => normalizeUrl(t.url)))
  const fresh = opts.dedupe ? savable.filter((t) => !already.has(normalizeUrl(t.url!))) : savable
  const duplicates = savable.length - fresh.length

  const converted = await toSavedTabs(fresh)
  const { spaceId, projectId, categoryId } = destination
  let groupId: string
  if (existing) {
    groupId = existing.id
    const start = existing.tabs.length
    if (converted.length) {
      yjs.addTabsBatch(spaceId, projectId, categoryId, groupId, converted.map((t, i) => ({ ...t, order: start + i })))
    }
  } else {
    groupId = uuidv7()
    yjs.addGroup(spaceId, projectId, categoryId, {
      id: groupId,
      name: destination.newGroupName?.trim() || NEW_GROUP_NAME,
      tabs: converted,
      order: category.groups.length,
    })
  }
  const persisted = await persistCapture()
  void rememberDestination({ spaceId, projectId, categoryId, groupId })

  return {
    target: { spaceId, projectId, categoryId, groupId },
    tabIds: converted.map((t) => t.id),
    createdGroup: !existing,
    duplicates,
    skipped,
    closed: [],
    persisted,
    at: Date.now(),
  }
}

/** Flush this context's doc to storage. False on failure (the change stays in memory for a retry). */
export async function persistCapture(): Promise<boolean> {
  try {
    await yjs.persistState()
    return true
  } catch (_) {
    return false
  }
}

/** Take this capture's tabs out of its group (and the group, if it made it and it's now empty). */
function detach(receipt: CaptureReceipt): SavedTab[] {
  const { spaceId, projectId, categoryId, groupId } = receipt.target
  const group = findCategory(yjs.getSpaces(), receipt.target)?.groups.find((g) => g.id === groupId)
  if (!group) return []
  const ids = new Set(receipt.tabIds)
  const taken = group.tabs.filter((t) => ids.has(t.id))
  for (const t of taken) yjs.removeTab(spaceId, projectId, categoryId, groupId, t.id)
  if (receipt.createdGroup && group.tabs.length === taken.length) {
    yjs.removeGroup(spaceId, projectId, categoryId, groupId)
  }
  return taken
}

/** Undo: remove what was saved and reopen any tabs that were closed. */
export async function undoCapture(receipt: CaptureReceipt): Promise<void> {
  detach(receipt)
  await yjs.persistState()
  await reopenTabs(receipt.closed)
}

/** Change: move this capture's tabs to another destination. */
export async function moveCapture(
  receipt: CaptureReceipt,
  destination: CaptureDestination,
): Promise<CaptureReceipt | CaptureFailure> {
  if (!findCategory(yjs.getSpaces(), destination)) return { error: "no-destination", skipped: 0 }
  const taken = detach(receipt)
  const moved = await captureTabs(
    taken.map((t) => ({ url: t.url, title: t.title, favIconUrl: t.favicon })),
    destination,
  )
  if (isCaptureFailure(moved)) return moved
  return { ...moved, duplicates: receipt.duplicates, skipped: receipt.skipped, closed: receipt.closed }
}

/**
 * Close saved browser tabs ("Close after saving"). Pinned tabs and pages that
 * can't be saved (incl. FlexTab's own pages) are never closed. A window that
 * would be left empty gets a new tab first, so closing never closes a window.
 */
export async function closeSavedTabs(tabs: ChromeTabLike[]): Promise<ClosedTab[]> {
  const closable = tabs.filter((t) => t.id !== undefined && !t.pinned && isSavableTabUrl(t.url))
  if (!closable.length) return []
  const byWindow = new Map<number, ChromeTabLike[]>()
  for (const t of closable) {
    const w = t.windowId ?? -1
    byWindow.set(w, [...(byWindow.get(w) ?? []), t])
  }
  for (const [windowId, closing] of byWindow) {
    if (windowId < 0) continue
    const all = await chrome.tabs.query({ windowId })
    if (all.length <= closing.length) await chrome.tabs.create({ windowId, active: true })
  }
  await chrome.tabs.remove(closable.map((t) => t.id!))
  return closable.map((t) => ({ windowId: t.windowId ?? -1, index: t.index ?? 0, url: t.url! }))
}

/** Reopen closed tabs in their window (or a new window if it's gone). */
export async function reopenTabs(closed: ClosedTab[]): Promise<void> {
  if (!closed.length) return
  const lost: string[] = []
  for (const t of [...closed].sort((a, b) => a.index - b.index)) {
    try {
      await chrome.tabs.create({ windowId: t.windowId, index: t.index, url: t.url, active: false })
    } catch (_) {
      lost.push(t.url)
    }
  }
  if (lost.length) await chrome.windows.create({ url: lost })
}

// ---------------------------------------------------------------------------
// Defaults and per-device settings
// ---------------------------------------------------------------------------

/**
 * Where a quick capture goes: the last group saved into (if it still exists),
 * else that category as a new group, else the preferred/first category with
 * its first group. Null when the workspace has no category yet.
 */
export function defaultDestination(
  spaces: SavedSpace[],
  recent: RecentDestination[],
  preferred: { spaceId?: string | null; projectId?: string | null; categoryId?: string | null } = {},
): CaptureDestination | null {
  for (const r of recent) {
    const category = findCategory(spaces, r)
    if (!category) continue
    const group = r.groupId ? category.groups.find((g) => g.id === r.groupId) : undefined
    return { spaceId: r.spaceId, projectId: r.projectId, categoryId: r.categoryId, groupId: group?.id }
  }
  const ids = resolveSaveTargetIds(spaces, preferred)
  const category = ids.categoryId ? findCategory(spaces, ids) : undefined
  if (!category) return null
  const first = [...category.groups].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0]
  return { ...ids, groupId: first?.id }
}

export async function loadDefaultDestination(
  preferred?: Parameters<typeof defaultDestination>[2],
): Promise<CaptureDestination | null> {
  return defaultDestination(yjs.getSpaces(), await loadRecentDestinations(), preferred)
}

/** Name for a window's worth of tabs, without seconds. */
export function windowGroupName(): string {
  return defaultSavedGroupName("Window")
}

export const CLOSE_AFTER_SAVE_KEY = "flextab_close_after_save"

export async function loadCloseAfterSave(): Promise<boolean> {
  try {
    return (await chrome.storage.local.get(CLOSE_AFTER_SAVE_KEY))[CLOSE_AFTER_SAVE_KEY] === true
  } catch (_) {
    return false
  }
}

export async function saveCloseAfterSave(value: boolean): Promise<void> {
  try { await chrome.storage.local.set({ [CLOSE_AFTER_SAVE_KEY]: value }) } catch (_) { /* per-device convenience */ }
}

/** Last background capture (shortcut / right-click), so the popup can offer Undo. */
export const LAST_CAPTURE_KEY = "flextab_last_capture"

export async function storeLastCapture(receipt: CaptureReceipt | null): Promise<void> {
  try {
    if (receipt) await chrome.storage.local.set({ [LAST_CAPTURE_KEY]: receipt })
    else await chrome.storage.local.remove(LAST_CAPTURE_KEY)
  } catch (_) { /* convenience only */ }
}

export async function loadLastCapture(maxAgeMs = 5 * 60_000): Promise<CaptureReceipt | null> {
  try {
    const r = (await chrome.storage.local.get(LAST_CAPTURE_KEY))[LAST_CAPTURE_KEY] as CaptureReceipt | undefined
    return r && typeof r.at === "number" && Date.now() - r.at <= maxAgeMs ? r : null
  } catch (_) {
    return null
  }
}

// ---------------------------------------------------------------------------
// Background service worker: keep its doc in step with storage
// ---------------------------------------------------------------------------

let workerHydrated = false

/**
 * Bring this context's doc up to date with storage right before a capture.
 * First call hydrates; later calls apply the stored state with the same
 * merge/replace rule as the page bridge (`page` merges, `snapshot` replaces),
 * so a long-lived worker never double-applies a snapshot. Used by the
 * background worker, which keeps no permanent storage listener.
 */
export async function syncDocFromStorage(): Promise<boolean> {
  try {
    if (!workerHydrated) {
      const loaded = await yjs.loadPersistedState()
      workerHydrated = loaded
      return loaded
    }
    const stored = (await chrome.storage.local.get(yjs.PERSIST_KEY))[yjs.PERSIST_KEY]
    const update = yjs.readPersistedUpdate(stored)
    if (!update) return false
    yjs.applyExternalPersistUpdate(update.data, update.origin)
    return true
  } catch (_) {
    return false
  }
}

/** Test seam: forget worker hydration. */
export function resetWorkerHydration(): void {
  workerHydrated = false
}
