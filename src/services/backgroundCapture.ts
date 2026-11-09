// Capture from outside any FlexTab page (TASK-2): the global keyboard
// commands and the right-click menu, handled in the background service
// worker. They save instantly to the last destination (same default as the
// popup) and confirm with the toolbar badge; the popup then offers Undo for
// the last such save.
import {
  captureTabs, closeSavedTabs, isCaptureFailure, loadCloseAfterSave, loadDefaultDestination,
  storeLastCapture, syncDocFromStorage, windowGroupName, type ChromeTabLike,
} from "~src/services/capture"

export const MENU_SAVE_PAGE = "flextab-save-page"
export const MENU_SAVE_LINK = "flextab-save-link"
export const MENU_SAVE_WINDOW = "flextab-save-window"
export const COMMAND_SAVE_PAGE = "save-page"
export const COMMAND_SAVE_WINDOW = "save-window"

const BADGE_MS = 2500

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

let badgeTimer: ReturnType<typeof setTimeout> | null = null
async function flashBadge(text: string, color: string, title: string): Promise<void> {
  try {
    await chrome.action.setBadgeBackgroundColor({ color })
    await chrome.action.setBadgeText({ text })
    await chrome.action.setTitle({ title })
    if (badgeTimer) clearTimeout(badgeTimer)
    badgeTimer = setTimeout(() => {
      void chrome.action.setBadgeText({ text: "" })
      void chrome.action.setTitle({ title: "FlexTab" })
    }, BADGE_MS)
  } catch (_) { /* badge is best-effort feedback */ }
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

  const destination = await loadDefaultDestination()

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

  // A window becomes its own group; a page or link joins the last group.
  const target = kind === "window" ? { ...destination, groupId: undefined, newGroupName: windowGroupName() } : destination
  const result = await captureTabs(tabs, target, { dedupe: kind !== "window" })
  if (isCaptureFailure(result)) {
    if (result.error === "nothing-savable") {
      await flashBadge("×", "#6b7280", "FlexTab: this page can't be saved")
      return "unsavable"
    }
    await openForChoice()
    return "no-destination"
  }
  if (!result.persisted) {
    await flashBadge("!", "#dc2626", "FlexTab: couldn't save to this device")
    return "failed"
  }
  if (result.tabIds.length === 0) {
    await flashBadge("✓", "#6b7280", "FlexTab: already saved")
    return "already"
  }

  const closed = kind === "window" && await loadCloseAfterSave() ? await closeSavedTabs(tabs) : []
  await storeLastCapture({ ...result, closed })
  await flashBadge(String(result.tabIds.length), "#16a34a", `FlexTab: saved ${result.tabIds.length} tab${result.tabIds.length === 1 ? "" : "s"}`)
  return "saved"
}
