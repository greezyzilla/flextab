// The toolbar button (TASK-78): its icon says something about the page in
// front, and only that. At rest it carries the saved check while the page is
// saved and is plain while it isn't; the tooltip says where, in the words
// Opened Tabs uses. Saved means what Opened Tabs and the popup mean
// (normalizeUrl + buildSavedUrlIndex), so the three always agree. A capture
// that fails, or a page that cannot be saved, shows its own mark for a moment.
// No browser badge is used (see toolbarMarks.ts).
//
// Icon and tooltip are set per tab, so Chrome itself shows the right one when
// the user switches tabs, even while this worker sleeps. They are recomputed on
// every tab switch, navigation and workspace change (any page, the popup, or a
// sync from another device writes the same storage key), and when the worker
// starts.
import { buildSavedUrlIndex, describeSaved, normalizeUrl, type SavedLocation } from "~src/lib/savedUrlIndex"
import * as yjs from "~src/lib/yjsDoc"
import { syncDocFromStorage } from "~src/services/capture"
import { isSavableTabUrl } from "~src/services/saveTabsAsGroup"
import { defaultIconPaths, markedIconImages, type ToolbarMark } from "~src/services/toolbarMarks"

export const IDLE_TITLE = "FlexTab"

/** How long workspace writes settle before the icon is recomputed (a rename types many). */
const SETTLE_MS = 150

/** Tabs showing a capture's mark; the resting state waits until it ends. */
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
    await chrome.action.setIcon(state.saved
      ? { tabId, imageData: await markedIconImages("saved") }
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

/** Put a tab back to its resting state now, ending any mark a capture left on it. */
export async function showResting(tabId: number): Promise<void> {
  const previous = flashing.get(tabId)
  if (previous) clearTimeout(previous)
  flashing.delete(tabId)
  try {
    await refreshToolbar([await chrome.tabs.get(tabId)])
  } catch (_) { /* closed */ }
}

/** A capture's mark on the tab it came from, for `ms`; then the tab gets its resting state back. */
export async function flashMark(tabId: number, mark: ToolbarMark, title: string, ms: number): Promise<void> {
  const previous = flashing.get(tabId)
  if (previous) clearTimeout(previous)
  flashing.set(tabId, setTimeout(() => {
    flashing.delete(tabId)
    void chrome.tabs.get(tabId).then((tab) => refreshToolbar([tab])).catch(() => { /* closed */ })
  }, ms))
  try {
    await chrome.action.setTitle({ tabId, title })
    await chrome.action.setIcon({ tabId, imageData: await markedIconImages(mark) })
  } catch (_) { /* the tab closed meanwhile; nothing to show */ }
}

let settle: ReturnType<typeof setTimeout> | null = null

/** Keep the toolbar button current. Call once from the background worker. */
export function installToolbarIcon(): void {
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
