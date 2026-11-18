// Capture from outside any FlexTab page (TASK-2): the global keyboard
// commands and the right-click menu, handled in the background service
// worker. They save instantly to the last destination (same default as the
// popup) and confirm on the toolbar icon; the popup then offers Undo for
// the last such save.
import {
  captureTabs, closeSavedTabs, isCaptureFailure, loadCloseAfter, loadSuggestedDestination, POPUP_CLOSE_PORT, POPUP_SUBJECT_KEY,
  storeLastCapture, syncDocFromStorage, windowGroupName, type ChromeTabLike,
} from "~src/services/capture"
import { isSavableTabUrl } from "~src/services/saveTabsAsGroup"
import * as yjs from "~src/lib/yjsDoc"
import { flashMark, showResting } from "~src/services/toolbarIcon"
import type { ToolbarMark } from "~src/services/toolbarMarks"

export const MENU_SAVE_PAGE = "flextab-save-page"
export const MENU_SAVE_LINK = "flextab-save-link"
export const MENU_SAVE_WINDOW = "flextab-save-window"
export const COMMAND_SAVE_PAGE = "save-page"
export const COMMAND_SAVE_WINDOW = "save-window"

const MARK_MS = 2500

export type BackgroundCaptureKind = "page" | "link" | "window"
export type BackgroundCaptureOutcome = "saved" | "already" | "unsavable" | "no-destination" | "no-workspace" | "failed"

/** (Re)create the right-click entries. Safe to call on every install/update. */
export function registerCaptureMenus(): void {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: MENU_SAVE_PAGE, title: "Save page to FlexTab", contexts: ["page"] })
    chrome.contextMenus.create({ id: MENU_SAVE_LINK, title: "Save link to FlexTab", contexts: ["link"] })
    chrome.contextMenus.create({ id: MENU_SAVE_WINDOW, title: "Save all tabs in this window to FlexTab", contexts: ["page", "action"] })
  })
}

export function menuKind(menuItemId: string | number): BackgroundCaptureKind | null {
  if (menuItemId === MENU_SAVE_PAGE) return "page"
  if (menuItemId === MENU_SAVE_LINK) return "link"
  if (menuItemId === MENU_SAVE_WINDOW) return "window"
  return null
}

export function commandKind(command: string): BackgroundCaptureKind | null {
  if (command === COMMAND_SAVE_PAGE) return "page"
  if (command === COMMAND_SAVE_WINDOW) return "window"
  return null
}

/**
 * Answer a capture on the toolbar icon of the tab it came from (the front tab
 * when there is none), TASK-78. A save is answered by the tab's resting state:
 * the saved check when the page in front is now saved. A capture that did not
 * save shows its mark for a moment, then the tab returns to its resting state.
 */
async function confirm(tab: chrome.tabs.Tab | undefined, mark?: { mark: ToolbarMark; title: string }): Promise<void> {
  try {
    const id = tab?.id ?? (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.id
    if (id === undefined) return
    if (mark) await flashMark(id, mark.mark, mark.title, MARK_MS)
    else await showResting(id)
  } catch (_) { /* the icon is best-effort feedback */ }
}

/** Open somewhere the user can finish: the popup if the browser allows, else the new tab page. */
async function openForChoice(): Promise<void> {
  try {
    await chrome.action.openPopup()
  } catch (_) {
    await chrome.tabs.create({ url: chrome.runtime.getURL("newtab.html") })
  }
}

/**
 * Save the page / link / window behind a command or menu click.
 * Before the first new tab has created the workspace it opens FlexTab
 * instead of saving. Inside a workspace a
 * save always lands: missing levels follow the default path (TASK-20), and
 * a workspace with no spaces gets the default space (TASK-37).
 */
export async function captureFromBackground(
  kind: BackgroundCaptureKind,
  context: { tab?: chrome.tabs.Tab; linkUrl?: string; linkText?: string },
): Promise<BackgroundCaptureOutcome> {
  const hasWorkspace = await syncDocFromStorage()
  if (!hasWorkspace) {
    await chrome.tabs.create({ url: chrome.runtime.getURL("newtab.html") })
    return "no-workspace"
  }

  let tabs: ChromeTabLike[]
  if (kind === "link") {
    tabs = context.linkUrl ? [{ url: context.linkUrl, title: context.linkText || context.linkUrl }] : []
  } else if (kind === "window") {
    tabs = context.tab?.windowId !== undefined
      ? await chrome.tabs.query({ windowId: context.tab.windowId })
      : await chrome.tabs.query({ currentWindow: true })
  } else {
    tabs = context.tab ? [context.tab] : await chrome.tabs.query({ active: true, currentWindow: true })
  }

  // Only a place you saved to before is used without asking (TASK-75). With
  // none (or "Remember where I last saved" off), nothing is guessed: the popup
  // opens to ask, holding the link when it was a link. An empty workspace has
  // nothing to pick from, so it still gets its default space (TASK-37).
  if (!tabs.some((t) => isSavableTabUrl(t.url))) {
    await confirm(context.tab, { mark: "unsavable", title: "FlexTab: this page can't be saved" })
    return "unsavable"
  }
  const suggestion = await loadSuggestedDestination()
  const remembered = suggestion.from === "recentGroup" || suggestion.from === "recentCategory"
  if (!remembered && yjs.getSpaces().length > 0) {
    if (kind === "link" && context.linkUrl) {
      await chrome.storage.session.set({ [POPUP_SUBJECT_KEY]: { url: context.linkUrl, title: context.linkText || context.linkUrl, at: Date.now() } })
    }
    await openForChoice()
    return "no-destination"
  }
  const destination = suggestion.destination

  // A window becomes its own group; a page or link joins the last group.
  const target = kind === "window" ? { ...destination, groupId: undefined, newGroupName: windowGroupName() } : destination
  const result = await captureTabs(tabs, target, { dedupe: kind !== "window" })
  // "nothing-savable" was answered above, so a failure here means no place.
  if (isCaptureFailure(result)) {
    await openForChoice()
    return "no-destination"
  }
  if (!result.persisted) {
    await confirm(context.tab, { mark: "failed", title: "FlexTab: couldn't save to this device" })
    return "failed"
  }
  if (result.tabIds.length === 0) {
    await confirm(context.tab)
    return "already"
  }

  // Settings › Saving & closing: a window follows "after saving a window", the page
  // follows "after saving from the popup" (the same act from the keyboard). A link has no tab.
  const closeKind = kind === "window" ? "window" : kind === "link" ? null : "popup"
  const closed = closeKind && await loadCloseAfter(closeKind) ? await closeSavedTabs(tabs) : []
  await storeLastCapture({ ...result, closed })
  await confirm(context.tab)
  return "saved"
}

/**
 * "Close after saving from the popup" for the page the popup saved: closing it
 * at once would close the popup and its Undo, so the popup names the tab over
 * a port and the tab closes when the popup does (the port disconnects). Undo
 * in the popup clears it first.
 */
export function registerPopupClose(): void {
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== POPUP_CLOSE_PORT) return
    let tabId: number | null = null
    port.onMessage.addListener((message: { close?: number | null }) => {
      tabId = typeof message?.close === "number" ? message.close : null
    })
    port.onDisconnect.addListener(() => {
      if (tabId === null) return
      void chrome.tabs.get(tabId).then((tab) => closeSavedTabs([tab])).catch(() => { /* already closed */ })
    })
  })
}
