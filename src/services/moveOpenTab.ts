/**
 * Moving an open tab to another place in the browser from Opened Tabs
 * (TASK-73): another window, or another spot in its own.
 */

/** Drop zone ids in Opened Tabs: a tab row (land beside it) and a window header (land at its end). */
export const OPEN_TAB_ZONE = "open-tab:"
export const OPEN_WINDOW_ZONE = "open-window:"
/** The panel itself: a drop between targets lands at the nearest row, never in the workspace. */
export const OPEN_PANEL_ZONE = "open-tabs-panel"

export function isOpenTabsZone(id: string): boolean {
  return id.startsWith(OPEN_TAB_ZONE) || id.startsWith(OPEN_WINDOW_ZONE) || id === OPEN_PANEL_ZONE
}

/** A tab where it is now: its window and its index there (the hidden FlexTab tab counts). */
export interface TabPlace { windowId: number; index: number }

/**
 * Where the tab ends up for a drop at `slot` (the gap before the tab now at
 * that index; the window's tab count is its end). Inside one window Chrome
 * counts the final index after the tab has left its old one.
 */
export function finalIndex(from: TabPlace, slot: TabPlace): number {
  return from.windowId === slot.windowId && from.index < slot.index ? slot.index - 1 : slot.index
}

/** A drop that would leave the tab where it is. */
export function isNoMove(from: TabPlace, slot: TabPlace): boolean {
  return from.windowId === slot.windowId && finalIndex(from, slot) === from.index
}

/** A dragged open tab shown where it would land (TASK-73). `label` names the window ("Window 2"). */
export interface OpenTabPreview { tabId: number; from: TabPlace; slot: TabPlace; label: string }

/**
 * The windows as they will be once the previewed move is done: the tab left
 * its window and stands at its final index in the target one, so the rows
 * around it have made room.
 */
export function previewWindows<W extends { id?: number; tabs?: chrome.tabs.Tab[] }>(windows: W[], preview: OpenTabPreview | null): W[] {
  if (!preview) return windows
  const tab = windows.flatMap((w) => w.tabs ?? []).find((t) => t.id === preview.tabId)
  if (!tab) return windows
  const at = finalIndex(preview.from, preview.slot)
  return windows.map((w) => {
    const others = (w.tabs ?? []).filter((t) => t.id !== preview.tabId)
    if (w.id !== preview.slot.windowId) return others.length === (w.tabs ?? []).length ? w : { ...w, tabs: others }
    return { ...w, tabs: [...others.slice(0, at), tab, ...others.slice(at)] }
  })
}

/**
 * Moves the tab to `slot` and returns its Undo, or null when nothing moved.
 * Moving a window's last tab closes that window (as in Chrome); Undo then
 * opens a window for the tab again.
 */
export async function moveOpenTab(tabId: number, from: TabPlace, slot: TabPlace): Promise<(() => Promise<void>) | null> {
  if (isNoMove(from, slot)) return null
  const left = await chrome.tabs.query({ windowId: from.windowId }).catch(() => [])
  const closesWindow = from.windowId !== slot.windowId && left.length === 1
  try {
    await chrome.tabs.move(tabId, { windowId: slot.windowId, index: finalIndex(from, slot) })
  } catch {
    return null
  }
  return async () => {
    try {
      if (closesWindow) await chrome.windows.create({ tabId, focused: false })
      else await chrome.tabs.move(tabId, { windowId: from.windowId, index: from.index })
    } catch {
      /* The tab or its old window is gone since: nothing to put back. */
    }
  }
}

/**
 * Move an open tab into a new window of its own (TASK-94, the non-drag move).
 * Undo puts it back where it was; Chrome closes the emptied new window itself.
 */
export async function moveOpenTabToNewWindow(tabId: number, from: TabPlace): Promise<(() => Promise<void>) | null> {
  try {
    await chrome.windows.create({ tabId, focused: false })
  } catch {
    return null
  }
  return async () => {
    try {
      await chrome.tabs.move(tabId, { windowId: from.windowId, index: from.index })
    } catch {
      /* The tab or its old window is gone since: nothing to put back. */
    }
  }
}
