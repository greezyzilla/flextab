// What ⌘K finds: open tabs, saved tabs and places (spaces,
// projects, categories, groups), each ranked the same way. Pure: the palette
// renders these lists and decides how many to show.

import type { SavedSpace, SavedTab } from "~src/types"
import { normalizeUrl } from "~src/lib/savedUrlIndex"
import { DEFAULT_CATEGORY_NAME, DEFAULT_PROJECT_NAME } from "~src/lib/defaultPath"
import { isSavableTabUrl } from "./saveTabsAsGroup"

export interface OpenTabHit {
  kind: "open"
  key: string
  tabId: number
  windowId: number
  /** "Window 2" when there is more than one window, else empty. */
  windowLabel: string
  title: string
  url: string
  favicon: string
}

export interface SavedTabHit {
  kind: "saved"
  key: string
  tab: SavedTab
  spaceId: string
  projectId: string
  categoryId: string
  groupId: string
  /** Where it lives, without the default "General" / "Uncategorized" names. */
  path: string[]
  /** The page is open in some window: Enter switches to it. */
  isOpen: boolean
}

export type PlaceLevel = "space" | "project" | "category" | "group"

export interface PlaceHit {
  kind: "place"
  key: string
  level: PlaceLevel
  id: string
  name: string
  spaceId: string
  projectId?: string
  categoryId?: string
  /** The place's parents, defaults left out. */
  path: string[]
}

export interface SearchResults {
  open: OpenTabHit[]
  saved: SavedTabHit[]
  places: PlaceHit[]
}

export interface OpenTabInput {
  id?: number
  windowId: number
  title?: string
  url?: string
  favIconUrl?: string
}

/** Lower is better; null = no match. Title start, word start, anywhere, then address. */
export function rank(query: string, title: string, url = ""): number | null {
  const t = title.toLowerCase()
  if (t.startsWith(query)) return 0
  if (t.split(/[\s\-_/·|:.,()]+/).some((w) => w.startsWith(query))) return 1
  if (t.includes(query)) return 2
  if (url.toLowerCase().includes(query)) return 3
  return null
}

const isDefault = (name: string, level: "project" | "category") =>
  name === (level === "project" ? DEFAULT_PROJECT_NAME : DEFAULT_CATEGORY_NAME)

function byRank<T>(hits: { hit: T; score: number }[]): T[] {
  return hits.sort((a, b) => a.score - b.score).map((h) => h.hit)
}

export function searchAll(rawQuery: string, spaces: SavedSpace[], openTabs: OpenTabInput[] = []): SearchResults {
  const q = rawQuery.trim().toLowerCase()
  if (!q) return { open: [], saved: [], places: [] }

  const openUrls = new Set(openTabs.map((t) => normalizeUrl(t.url)))
  const savedUrls = new Set<string>()
  const saved: { hit: SavedTabHit; score: number }[] = []
  const places: { hit: PlaceHit; score: number }[] = []
  const place = (hit: Omit<PlaceHit, "kind" | "key">) => {
    const score = rank(q, hit.name)
    if (score !== null) places.push({ hit: { ...hit, kind: "place", key: `place:${hit.level}:${hit.id}` }, score })
  }

  for (const space of spaces) {
    place({ level: "space", id: space.id, name: space.name, spaceId: space.id, path: [] })
    for (const project of space.projects) {
      const projectPath = isDefault(project.name, "project") ? [space.name] : [space.name, project.name]
      place({ level: "project", id: project.id, name: project.name, spaceId: space.id, projectId: project.id, path: [space.name] })
      for (const category of project.categories) {
        const categoryPath = isDefault(category.name, "category") ? projectPath : [...projectPath, category.name]
        place({ level: "category", id: category.id, name: category.name, spaceId: space.id, projectId: project.id, categoryId: category.id, path: projectPath })
        for (const group of category.groups) {
          place({ level: "group", id: group.id, name: group.name, spaceId: space.id, projectId: project.id, categoryId: category.id, path: categoryPath })
          for (const tab of group.tabs) {
            savedUrls.add(normalizeUrl(tab.url))
            const score = rank(q, tab.title, tab.url)
            if (score === null) continue
            saved.push({
              hit: {
                kind: "saved", key: `saved:${tab.id}`, tab,
                spaceId: space.id, projectId: project.id, categoryId: category.id, groupId: group.id,
                path: [...categoryPath, group.name], isOpen: openUrls.has(normalizeUrl(tab.url)),
              },
              score,
            })
          }
        }
      }
    }
  }

  // Open tabs that are also saved show once, as saved with "Open" (Enter
  // switches to them); this section is for pages not saved anywhere.
  const windowIds = [...new Set(openTabs.map((t) => t.windowId))]
  const open: { hit: OpenTabHit; score: number }[] = []
  for (const t of openTabs) {
    if (t.id === undefined || !isSavableTabUrl(t.url) || savedUrls.has(normalizeUrl(t.url))) continue
    const title = t.title || t.url!
    const score = rank(q, title, t.url)
    if (score === null) continue
    open.push({
      hit: {
        kind: "open", key: `open:${t.id}`, tabId: t.id, windowId: t.windowId,
        windowLabel: windowIds.length > 1 ? `Window ${windowIds.indexOf(t.windowId) + 1}` : "",
        title, url: t.url!, favicon: t.favIconUrl ?? "",
      },
      score,
    })
  }

  return { open: byRank(open), saved: byRank(saved), places: byRank(places) }
}
