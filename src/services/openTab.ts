import { normalizeUrl } from "~src/lib/savedUrlIndex"
import type { GroupColor } from "~src/types"
import { recordOpenLinks, type OpenLink } from "~src/services/openLinks"

/**
 * Go to a saved URL (TASK-4): if a tab with the same URL is already open in
 * any window, focus that tab and its window instead of opening a copy;
 * otherwise open it in a new tab. Callers keep "always new" for
 * modifier/middle clicks by not calling this. With `link`, the browser tab is
 * remembered as opened from that saved tab (TASK-72), so it can be updated
 * once the page has moved on.
 */
export async function openOrFocus(url: string, link?: OpenLink): Promise<"focused" | "opened"> {
  const key = normalizeUrl(url)
  const open = (await chrome.tabs.query({})).find((t) => t.id !== undefined && normalizeUrl(t.url) === key)
  if (open?.id !== undefined) {
    await chrome.tabs.update(open.id, { active: true })
    if (open.windowId !== undefined) await chrome.windows.update(open.windowId, { focused: true })
    if (link) await recordOpenLinks([[open.id, link]])
    return "focused"
  }
  const created = await chrome.tabs.create({ url })
  if (link && created?.id !== undefined) await recordOpenLinks([[created.id, link]])
  return "opened"
}

/** Tabs that were just opened, and the window they are in. */
export interface Opened { tabIds: number[]; windowId?: number }

const ids = (tabs: (chrome.tabs.Tab | undefined)[]) =>
  tabs.map((t) => t?.id).filter((id): id is number => typeof id === "number")

/** Open several URLs as tabs in the window this page is in. */
export async function openInCurrentWindow(urls: string[]): Promise<Opened> {
  const win = await chrome.windows.getCurrent()
  const tabs: (chrome.tabs.Tab | undefined)[] = []
  for (const url of urls) tabs.push(await chrome.tabs.create({ url, windowId: win.id, active: false }))
  return { tabIds: ids(tabs), windowId: win.id }
}

/** Open several URLs in one new window. */
export async function openInNewWindow(urls: string[]): Promise<Opened> {
  const win = await chrome.windows.create({ url: urls })
  return { tabIds: ids(win?.tabs ?? []), windowId: win?.id }
}

// --- Browser tab groups (TASK-31) ---
//
// "Open all" can give a saved group back as the browser's own tab group, with
// the same name and colour. Grouping tabs needs no permission, but naming and
// colouring the group needs `tabGroups`, an optional permission asked for in
// context. Whatever fails (no API, permission declined, a browser that has the
// API but refuses to group, as Opera Air does), the tabs stay open as plain
// tabs: never fewer tabs than before.

const TAB_GROUPS: chrome.permissions.Permissions = { permissions: ["tabGroups"] }

/** This browser has tab groups an extension can create. */
export function canGroupTabs(): boolean {
  return typeof chrome.tabs?.group === "function" && typeof chrome.permissions?.request === "function"
}

export type TabGroupsPermission = "granted" | "declined" | "unavailable"

/**
 * Ask for `tabGroups`. Chrome only shows the prompt from a user gesture, so
 * call this synchronously inside the click, before any await. Resolves without
 * a prompt when it was granted before.
 */
export function requestTabGroups(): Promise<TabGroupsPermission> {
  if (!canGroupTabs()) return Promise.resolve("unavailable")
  try {
    return chrome.permissions.request(TAB_GROUPS).then(
      (granted) => (granted ? "granted" : "declined"),
      () => "unavailable" as const,
    )
  } catch {
    return Promise.resolve("unavailable")
  }
}

/** Give `tabGroups` back when the person turns the feature off. */
export async function releaseTabGroups(): Promise<void> {
  try { await chrome.permissions?.remove?.(TAB_GROUPS) } catch { /* nothing to give back */ }
}

/** A saved group's name and colour, for the tab group it opens as. */
export interface GroupLook { title: string; color?: GroupColor }

/**
 * Put opened tabs into one tab group with the saved group's name and colour.
 * An uncoloured group is grey: left to the browser, the same group would get a
 * different colour every time it opens. Returns false and leaves plain tabs on
 * any failure, including a group that was made but could not be named.
 */
export async function groupOpenedTabs({ tabIds, windowId }: Opened, look: GroupLook): Promise<boolean> {
  const tabGroups = chrome.tabGroups
  if (tabIds.length === 0 || typeof tabGroups?.update !== "function") return false
  let groupId: number
  try {
    groupId = await chrome.tabs.group({
      tabIds: tabIds as [number, ...number[]],
      ...(windowId !== undefined ? { createProperties: { windowId } } : {}),
    })
  } catch {
    return false
  }
  try {
    await tabGroups.update(groupId, { title: look.title, color: (look.color ?? "grey") as chrome.tabGroups.ColorEnum })
    return true
  } catch {
    // No unnamed groups: an unnamed one is only a coloured dot in the tab strip.
    try { await chrome.tabs.ungroup(tabIds as [number, ...number[]]) } catch { /* the tabs are open either way */ }
    return false
  }
}

export interface OpenGroupResult { permission: TabGroupsPermission | "off"; grouped: boolean }

/**
 * Open a saved group's tabs here or in a new window (TASK-4), as a browser tab
 * group when `asTabGroup` is on and the browser allows it (TASK-31). Call it
 * synchronously from the click: the permission request must go out inside the
 * gesture. The tabs open at once, without waiting for the answer, so an
 * unanswered prompt never holds them back; they are grouped once it is granted.
 */
export function openGroupTabs(urls: string[], where: "here" | "new-window", look: GroupLook, asTabGroup: boolean, links?: OpenLink[]): Promise<OpenGroupResult> {
  const permission: Promise<TabGroupsPermission | "off"> = asTabGroup ? requestTabGroups() : Promise.resolve("off")
  const opening = where === "here" ? openInCurrentWindow(urls) : openInNewWindow(urls)
  return (async () => {
    const [answer, opened] = await Promise.all([permission, opening])
    // Tabs come back in the order of `urls` (TASK-72: each remembers its saved tab).
    if (links && opened.tabIds.length === urls.length) {
      await recordOpenLinks(opened.tabIds.map((id, i) => [id, links[i]] as [number, OpenLink]))
    }
    const grouped = answer === "granted" ? await groupOpenedTabs(opened, look) : false
    return { permission: answer, grouped }
  })()
}
