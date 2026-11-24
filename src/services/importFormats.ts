// Import from where users come from: a FlexTab backup, a bookmarks
// export (the Netscape HTML every browser and most tab managers write), or a
// OneTab export (`url | title` lines). Files are untrusted: only http(s)
// links are kept (no `javascript:` bookmarklets), and stored icons are
// dropped so a bookmarks file cannot bloat the synced tree with data URIs.
//
// Everything here is pure: it reads text and returns spaces with fresh ids.
// Writing them into the workspace is the caller's job, after a preview.

import { v7 as uuidv7 } from "uuid"
import type { SavedGroup, SavedSpace, SavedTab } from "~src/types"
import { parseWorkspaceBackup } from "./workspaceBackup"
import { isSavableTabUrl } from "./saveTabsAsGroup"
import { DEFAULT_CATEGORY_NAME, DEFAULT_PROJECT_NAME } from "~src/lib/defaultPath"

export type ImportSource = "flextab" | "bookmarks" | "onetab"

export const SOURCE_LABEL: Record<ImportSource, string> = {
  flextab: "FlexTab backup",
  bookmarks: "Bookmarks",
  onetab: "OneTab",
}

export interface ParsedImport {
  source: ImportSource
  spaces: SavedSpace[]
  /** Links left out because they are not web pages (bookmarklets, chrome://, file:). */
  skipped: number
}

type NewId = () => string

const tab = (url: string, title: string, order: number, newId: NewId): SavedTab =>
  ({ id: newId(), url, title: title.trim() || url, favicon: "", order })

const group = (name: string, tabs: SavedTab[], order: number, newId: NewId): SavedGroup =>
  ({ id: newId(), name, tabs, order })

/** One space holding projects of groups, each project with the default category. */
function space(name: string, projects: { name: string; groups: SavedGroup[] }[], newId: NewId): SavedSpace {
  return {
    id: newId(), name,
    projects: projects.map((p, pi) => ({
      id: newId(), name: p.name, order: pi,
      categories: [{ id: newId(), name: DEFAULT_CATEGORY_NAME, order: 0, groups: p.groups }],
    })),
  }
}

/**
 * Bookmarks HTML. Folders nest deeper than FlexTab's levels, so each
 * top-level folder becomes a project and every folder that holds links becomes
 * a group named by its path inside that project ("Dev › React").
 */
export function parseBookmarksHtml(html: string, newId: NewId = uuidv7): ParsedImport {
  const root = new DOMParser().parseFromString(html, "text/html").querySelector("dl")
  if (!root) throw new Error("This bookmarks file has no folders or links.")
  let skipped = 0
  const projects = new Map<string, Map<string, SavedTab[]>>()
  const add = (path: string[], a: HTMLAnchorElement) => {
    const url = a.getAttribute("href") ?? ""
    if (!isSavableTabUrl(url)) { skipped++; return }
    const project = path[0] ?? "Bookmarks"
    const groupName = path.length > 1 ? path.slice(1).join(" › ") : project
    const groups = projects.get(project) ?? new Map<string, SavedTab[]>()
    projects.set(project, groups)
    const tabs = groups.get(groupName) ?? []
    groups.set(groupName, tabs)
    tabs.push(tab(url, a.textContent as string, tabs.length, newId)) // an element's text is never null
  }
  const walk = (dl: Element, path: string[]) => {
    for (const dt of Array.from(dl.children).filter((el) => el.tagName === "DT")) {
      const folder = Array.from(dt.children).find((el) => el.tagName === "H3")
      if (folder) {
        // The folder's list is inside the DT, or (in some exports) right after it.
        const inner = Array.from(dt.children).find((el) => el.tagName === "DL")
          ?? (dt.nextElementSibling?.tagName === "DD" ? dt.nextElementSibling.querySelector("dl") : null)
        if (inner) walk(inner, [...path, (folder.textContent as string).trim() || "Folder"])
        continue
      }
      const a = Array.from(dt.children).find((el) => el.tagName === "A")
      if (a) add(path, a as HTMLAnchorElement)
    }
  }
  walk(root, [])
  const list = [...projects].map(([name, groups]) => ({
    name,
    groups: [...groups].map(([g, tabs], i) => group(g, tabs, i, newId)),
  }))
  if (list.length === 0) throw new Error(skipped ? "None of these bookmarks are web pages that can be saved." : "This bookmarks file has no links.")
  return { source: "bookmarks", spaces: [space("Bookmarks", list, newId)], skipped }
}

/** OneTab export: one `url | title` per line, a blank line between groups. */
export function parseOneTab(text: string, newId: NewId = uuidv7): ParsedImport {
  let skipped = 0
  const blocks: SavedTab[][] = [[]]
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) { if (blocks[blocks.length - 1].length) blocks.push([]); continue }
    const cut = line.indexOf(" | ")
    const url = (cut < 0 ? line : line.slice(0, cut)).trim()
    const title = cut < 0 ? "" : line.slice(cut + 3)
    if (!isSavableTabUrl(url)) { skipped++; continue }
    const current = blocks[blocks.length - 1]
    current.push(tab(url, title, current.length, newId))
  }
  const groups = blocks.filter((b) => b.length).map((tabs, i, all) => group(all.length === 1 ? "OneTab" : `OneTab ${i + 1}`, tabs, i, newId))
  if (groups.length === 0) throw new Error("This file has no links in OneTab's “url | title” format.")
  return { source: "onetab", spaces: [space("OneTab", [{ name: DEFAULT_PROJECT_NAME, groups }], newId)], skipped }
}

/** Fresh ids throughout, so a backup can be added beside the workspace it came from. */
export function withFreshIds(spaces: SavedSpace[], newId: NewId = uuidv7): SavedSpace[] {
  return spaces.map((s) => ({
    ...s, id: newId(),
    projects: s.projects.map((p) => ({
      ...p, id: newId(),
      categories: p.categories.map((c) => ({
        ...c, id: newId(),
        groups: c.groups.map((g) => ({ ...g, id: newId(), tabs: g.tabs.map((t) => ({ ...t, id: newId() })) })),
      })),
    })),
  }))
}

/** Read an import file, recognising its format from the content. */
export function parseImport(text: string): ParsedImport {
  const head = text.trimStart()
  if (head.startsWith("[") || head.startsWith("{")) {
    let json: unknown
    try { json = JSON.parse(text) } catch { throw new Error("This JSON file can't be read.") }
    return { source: "flextab", spaces: parseWorkspaceBackup(json), skipped: 0 }
  }
  if (/<!DOCTYPE NETSCAPE-Bookmark-file/i.test(head) || /<dl[\s>]/i.test(text)) return parseBookmarksHtml(text)
  return parseOneTab(text)
}

export function countTabs(spaces: SavedSpace[]): number {
  return spaces.reduce((n, s) => n + s.projects.reduce((a, p) => a + p.categories.reduce((b, c) => b + c.groups.reduce((d, g) => d + g.tabs.length, 0), 0), 0), 0)
}

export function countGroups(spaces: SavedSpace[]): number {
  return spaces.reduce((n, s) => n + s.projects.reduce((a, p) => a + p.categories.reduce((b, c) => b + c.groups.length, 0), 0), 0)
}
