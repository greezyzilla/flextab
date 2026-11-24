// "Show in FlexTab": take the workspace to where something lives,
// the way a person would walk there: the space, its project (opened in the
// sidebar), the category's section, then point at the tab or group.

import { navigate } from "~src/lib/route"
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore"
import { useUIStore } from "~src/store/useUIStore"

export interface RevealTarget {
  spaceId: string
  projectId?: string
  categoryId?: string
  /** Point at this tab or group once there. */
  flash?: { kind: "tab" | "group"; id: string }
}

export function revealInWorkspace(target: RevealTarget): void {
  // Anywhere but the workspace ("#/settings/…"): go back to it first.
  if (window.location.hash.replace(/^#\/?/, "")) navigate("/")
  const store = useSavedSpacesStore.getState()
  if (store.activeSpaceId !== target.spaceId) store.setActiveSpace(target.spaceId)
  if (target.projectId) {
    if (useSavedSpacesStore.getState().activeProjectId !== target.projectId) useSavedSpacesStore.getState().setActiveProject(target.projectId)
    if (!useSavedSpacesStore.getState().expandedProjectIds.includes(target.projectId)) useSavedSpacesStore.getState().toggleExpandedProject(target.projectId)
  }
  const ui = useUIStore.getState()
  if (target.categoryId) {
    useSavedSpacesStore.getState().setActiveCategory(target.categoryId)
    ui.requestScrollToCategory(target.categoryId, "top")
  }
  if (target.flash) ui.flash(target.flash.kind, target.flash.id)
}

/**
 * "Open in FlexTab" from the toolbar popup: the popup can't drive
 * the dashboard's stores, so it leaves the target for one FlexTab tab and
 * brings that tab forward. The tab it names reveals the target and clears it.
 */
export const REVEAL_REQUEST_KEY = "flextab_reveal_request"
export type RevealRequest = { tabId: number; target: RevealTarget; at: number }
/** Older requests are ignored, so a stale one never moves a page opened later. */
export const REVEAL_REQUEST_TTL_MS = 30_000

/** An open FlexTab page in this window (most recently used), or a new one. */
export async function openInFlexTab(target: RevealTarget): Promise<void> {
  const page = chrome.runtime.getURL("newtab.html")
  // Matched by address, not a query pattern: chrome:// isn't a valid pattern,
  // and the new tab override shows as chrome://newtab/.
  const tabs = await chrome.tabs.query({ currentWindow: true }).catch(() => [] as chrome.tabs.Tab[])
  const open = tabs.filter((t) => t.id !== undefined && (t.url?.startsWith(page) || t.url?.startsWith("chrome://newtab")))
  const used = (t: chrome.tabs.Tab) => (t as { lastAccessed?: number }).lastAccessed ?? 0
  const best = open.sort((a, b) => used(b) - used(a))[0]
  const tab = best ?? await chrome.tabs.create({ url: page, active: false })
  if (tab.id === undefined) return
  const request: RevealRequest = { tabId: tab.id, target, at: Date.now() }
  await chrome.storage.session.set({ [REVEAL_REQUEST_KEY]: request })
  await chrome.tabs.update(tab.id, { active: true })
}

/** Reveal the request meant for this tab, if there is a fresh one, and clear it. */
export async function takeRevealRequest(myTabId: number | undefined, request: unknown): Promise<boolean> {
  const r = request as RevealRequest | undefined
  if (myTabId === undefined || !r || r.tabId !== myTabId || Date.now() - r.at > REVEAL_REQUEST_TTL_MS) return false
  await chrome.storage.session.remove(REVEAL_REQUEST_KEY)
  revealInWorkspace(r.target)
  return true
}
