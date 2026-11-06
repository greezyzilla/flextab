import { normalizeUrl } from "~src/lib/savedUrlIndex"

/**
 * Go to a saved URL (TASK-4): if a tab with the same URL is already open in
 * any window, focus that tab and its window instead of opening a copy;
 * otherwise open it in a new tab. Callers keep "always new" for
 * modifier/middle clicks by not calling this.
 */
export async function openOrFocus(url: string): Promise<"focused" | "opened"> {
  const key = normalizeUrl(url)
  const open = (await chrome.tabs.query({})).find((t) => t.id !== undefined && normalizeUrl(t.url) === key)
  if (open?.id !== undefined) {
    await chrome.tabs.update(open.id, { active: true })
    if (open.windowId !== undefined) await chrome.windows.update(open.windowId, { focused: true })
    return "focused"
  }
  await chrome.tabs.create({ url })
  return "opened"
}

/** Open several URLs as tabs in the window this page is in. */
export async function openInCurrentWindow(urls: string[]): Promise<void> {
  const win = await chrome.windows.getCurrent()
  for (const url of urls) await chrome.tabs.create({ url, windowId: win.id, active: false })
}
