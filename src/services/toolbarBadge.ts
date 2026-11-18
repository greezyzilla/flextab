// The toolbar button at rest (TASK-78): a small green check drawn on the
// FlexTab icon while the tab in front is saved, the plain icon while it isn't.
// Its tooltip says where, in the words Opened Tabs uses. Saved means what
// Opened Tabs and the popup mean (normalizeUrl + buildSavedUrlIndex), so the
// three always agree. The badge is kept for a capture's short confirmation.
//
// Icon, badge and tooltip are set per tab, so Chrome itself shows the right one
// when the user switches tabs, even while this worker sleeps. They are
// recomputed on every tab switch, navigation and workspace change (any page,
// the popup, or a sync from another device writes the same storage key), and
// when the worker starts.
import { buildSavedUrlIndex, describeSaved, normalizeUrl, type SavedLocation } from "~src/lib/savedUrlIndex"
import * as yjs from "~src/lib/yjsDoc"
import { syncDocFromStorage } from "~src/services/capture"
import { defaultIconPaths, savedIconImages } from "~src/services/savedMarkIcon"
import { isSavableTabUrl } from "~src/services/saveTabsAsGroup"

export const IDLE_TITLE = "FlexTab"

/** How long workspace writes settle before the mark is recomputed (a rename types many). */
const SETTLE_MS = 150

/** Tabs showing a capture confirmation; the resting state waits until it ends. */
const flashing = new Map<number, ReturnType<typeof setTimeout>>()

export type ToolbarState = { saved: boolean; title: string }

/** The resting state for a page: saved and where, or not. */
export function toolbarStateFor(url: string | undefined, index: Map<string, SavedLocation[]>): ToolbarState {
  const saved = isSavableTabUrl(url) ? describeSaved(index.get(normalizeUrl(url))) : null
  return saved ? { saved: true, title: `${IDLE_TITLE}: ${saved}` } : { saved: false, title: IDLE_TITLE }
}

async function rest(tabId: number, state: ToolbarState): Promise<void> {
  try {
    await chrome.action.setTitle({ tabId, title: state.title })
    await chrome.action.setBadgeText({ tabId, text: "" })
    await chrome.action.setIcon(state.saved
      ? { tabId, imageData: await savedIconImages() }
      : { tabId, path: defaultIconPaths() })
  } catch (_) { /* the tab closed meanwhile, or the mark could not be drawn; the next event repaints */ }
}

async function savedIndex(): Promise<Map<string, SavedLocation[]>> {
  return (await syncDocFromStorage()) ? buildSavedUrlIndex(yjs.getSpaces()) : new Map()
}

/** Recompute the resting state of these tabs (the front tab of each window by default). */
export async function refreshToolbar(tabs?: chrome.tabs.Tab[]): Promise<void> {
  try {
    const targets = tabs ?? await chrome.tabs.query({ active: true })
    if (!targets.length) return
    const index = await savedIndex()
    await Promise.all(targets.map((tab) => {
      if (tab.id === undefined || flashing.has(tab.id)) return undefined
      return rest(tab.id, toolbarStateFor(tab.url || tab.pendingUrl, index))
    }))
  } catch (_) { /* best-effort: the next event repaints */ }
}

/**
 * A capture's confirmation on the tab it came from, as a badge for `ms`; then
 * the tab gets its resting state back, which after a save is the check.
 */
export async function flashBadge(tabId: number, text: string, background: string, title: string, ms: number): Promise<void> {
  const previous = flashing.get(tabId)
  if (previous) clearTimeout(previous)
  flashing.set(tabId, setTimeout(() => {
    flashing.delete(tabId)
    void chrome.tabs.get(tabId).then((tab) => refreshToolbar([tab])).catch(() => { /* closed */ })
  }, ms))
  try {
    await chrome.action.setBadgeBackgroundColor({ tabId, color: background })
    await chrome.action.setBadgeTextColor?.({ tabId, color: "#ffffff" })
    await chrome.action.setBadgeText({ tabId, text })
    await chrome.action.setTitle({ tabId, title })
  } catch (_) { /* the tab closed meanwhile; nothing to show */ }
}

let settle: ReturnType<typeof setTimeout> | null = null

/** Keep the toolbar button current. Call once from the background worker. */
export function installToolbarBadge(): void {
  chrome.tabs.onActivated.addListener(({ tabId }) => {
    void chrome.tabs.get(tabId).then((tab) => refreshToolbar([tab])).catch(() => { /* closed */ })
  })
  chrome.tabs.onUpdated.addListener((_tabId, change, tab) => {
    if (change.url !== undefined && tab.active) void refreshToolbar([tab])
  })
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !(yjs.PERSIST_KEY in changes)) return
    if (settle) clearTimeout(settle)
    settle = setTimeout(() => { settle = null; void refreshToolbar() }, SETTLE_MS)
  })
  // The worker just started (install, browser start, or waking from sleep).
  void refreshToolbar()
}
