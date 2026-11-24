import * as yjs from "~src/lib/yjsDoc"
import { normalizeUrl } from "~src/lib/savedUrlIndex"
import { faviconToDataUrl } from "~src/utils/favicon"
import type { SavedSpace, SavedTab } from "~src/types"

/**
 * Which saved tab a browser tab was opened from.
 *
 * When FlexTab opens a saved tab (card click, Open all, the ⌘K palette) it
 * records "browser tab N came from saved tab T at location L". The browser tab
 * id survives navigation, so the link still holds once the page has moved on
 * (episode 1 -> episode 2), even when many saved tabs share one host. Session
 * storage: this device, this browser session, never a server; a browser
 * restart forgets the links.
 */
export interface OpenLink {
  spaceId: string
  projectId: string
  categoryId: string
  groupId: string
  /** The saved tab's id (not the browser tab's). */
  tabId: string
}

const KEY = "flextab_open_links"
/** The saved tab updated last from outside the dashboard (the popup), for the dashboard to point at. */
export const JUST_UPDATED_KEY = "flextab_just_updated"
export { KEY as OPEN_LINKS_KEY }
type Links = Record<string, OpenLink>

/** All links, keyed by browser tab id. */
export async function readOpenLinks(): Promise<Links> {
  return readLinks()
}

/** Tell the dashboard which saved tab the popup just updated, so it can outline it. */
export async function noteJustUpdated(savedTabId: string): Promise<void> {
  try { await chrome.storage.session.set({ [JUST_UPDATED_KEY]: { id: savedTabId, at: Date.now() } }) } catch { /* cosmetic */ }
}

async function readLinks(): Promise<Links> {
  try {
    const got = await chrome.storage.session.get(KEY)
    return (got?.[KEY] as Links | undefined) ?? {}
  } catch {
    return {}
  }
}

/** Record links from browser tabs to saved tabs; links of tabs that are gone are dropped. */
export async function recordOpenLinks(entries: Array<[browserTabId: number, link: OpenLink]>): Promise<void> {
  if (entries.length === 0) return
  try {
    const links = await readLinks()
    for (const [id, link] of entries) links[String(id)] = link
    const alive = new Set((await chrome.tabs.query({})).map((t) => String(t.id)))
    for (const id of Object.keys(links)) if (!alive.has(id)) delete links[id]
    await chrome.storage.session.set({ [KEY]: links })
  } catch {
    // Without session storage the update offer simply doesn't appear.
  }
}

/** The saved tab a browser tab was opened from, if FlexTab opened it. */
export async function getOpenLink(browserTabId: number | undefined): Promise<OpenLink | null> {
  if (browserTabId === undefined) return null
  return (await readLinks())[String(browserTabId)] ?? null
}

/** The saved tab a link points at, if it still exists there. */
export function findLinkedTab(spaces: SavedSpace[], link: OpenLink): SavedTab | null {
  return spaces.find((s) => s.id === link.spaceId)
    ?.projects.find((p) => p.id === link.projectId)
    ?.categories.find((c) => c.id === link.categoryId)
    ?.groups.find((g) => g.id === link.groupId)
    ?.tabs.find((t) => t.id === link.tabId) ?? null
}

/** A page to point a saved tab at: what chrome.tabs gives. */
export interface PageLike { url?: string; title?: string; favIconUrl?: string }

/**
 * Point the linked saved tab at `page`, in place: its id, position and group
 * stay; url, title (often carrying the new episode) and favicon change. One
 * field edit on one tab, so sync merges it like any rename. Returns the old
 * tab for Undo, or null when the saved tab is gone.
 */
export async function updateLinkedTab(link: OpenLink, page: PageLike): Promise<SavedTab | null> {
  const before = findLinkedTab(yjs.getSpaces(), link)
  if (!before || !page.url) return null
  const favicon = await faviconToDataUrl(page.favIconUrl || "", page.url)
  yjs.updateTab(link.spaceId, link.projectId, link.categoryId, link.groupId, {
    ...before, url: page.url, title: page.title || before.title, favicon: favicon || before.favicon,
  })
  return before
}

/** Undo `updateLinkedTab`: put the old url, title and favicon back. */
export function restoreLinkedTab(link: OpenLink, before: SavedTab): void {
  yjs.updateTab(link.spaceId, link.projectId, link.categoryId, link.groupId, before)
}

const segments = (url: string) => { try { return new URL(url).pathname.split("/").filter(Boolean) } catch { return [] } }

/**
 * The one saved tab this page most likely continues, for a page not
 * opened from FlexTab: same host, and the address shares most of its path
 * with the saved one ("/anime/2711/ore-dake/episode/1" vs ".../episode/3").
 * Null unless a single saved tab clearly wins, so a guess is never offered
 * where two saved tabs match equally.
 */
export function bestSameHostMatch(spaces: SavedSpace[], url: string | undefined): { link: OpenLink; tab: SavedTab; path: string } | null {
  const scored = continuations(spaces, url)
  if (scored.length === 0 || (scored.length > 1 && scored[1].score === scored[0].score)) return null
  return scored[0].hit
}

/**
 * Saved tabs this page looks like the next step of (same host, the same path
 * up to the episode), most alike first. Two or more equally alike means "one of
 * these, but which?": the only time the popup offers picking one.
 */
export function continuationTabs(spaces: SavedSpace[], url: string | undefined): Array<{ link: OpenLink; tab: SavedTab; path: string }> {
  return continuations(spaces, url).map((c) => c.hit)
}

function continuations(spaces: SavedSpace[], url: string | undefined) {
  const mine = segments(url ?? "")
  if (mine.length === 0) return []
  return sameHostTabs(spaces, url).map((hit) => {
    const theirs = segments(hit.tab.url)
    let shared = 0
    while (shared < mine.length && shared < theirs.length && mine[shared] === theirs[shared]) shared++
    return { hit, shared, score: shared / Math.max(mine.length, theirs.length) }
  }).filter((c) => c.shared >= 2 && c.score >= 0.6).sort((x, y) => y.score - x.score)
}

/** Saved tabs on the same host as `url`, for updating one when the page was not opened from FlexTab. */
export function sameHostTabs(spaces: SavedSpace[], url: string | undefined): Array<{ link: OpenLink; tab: SavedTab; path: string }> {
  let host: string
  try { host = new URL(url ?? "").host } catch { return [] }
  if (!host) return []
  const out: Array<{ link: OpenLink; tab: SavedTab; path: string }> = []
  for (const s of spaces) for (const p of s.projects) for (const c of p.categories) for (const g of c.groups) {
    for (const t of g.tabs) {
      let h = ""
      try { h = new URL(t.url).host } catch { continue }
      if (h === host && normalizeUrl(t.url) !== normalizeUrl(url)) {
        out.push({ link: { spaceId: s.id, projectId: p.id, categoryId: c.id, groupId: g.id, tabId: t.id }, tab: t, path: `${s.name} › ${g.name}` })
      }
    }
  }
  // Most alike first: the longest shared path start (same show before other shows).
  const mine = segments(url as string) // a valid URL by now: its host parsed above
  const shared = (u: string) => { const theirs = segments(u); let n = 0; while (n < mine.length && mine[n] === theirs[n]) n++; return n }
  return out.map((h) => ({ h, n: shared(h.tab.url) })).sort((a, b) => b.n - a.n).map(({ h }) => h)
}
