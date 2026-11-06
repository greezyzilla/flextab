import type { SavedSpace } from "~src/types"

/**
 * One URL identity for the whole app (TASK-4): saved tabs, open tabs and
 * duplicate checks all compare through this. The host is lowercased (via
 * URL) and a trailing slash on the path is ignored. Query and hash are kept:
 * many apps route on them (e.g. mail clients), so dropping them would merge
 * different pages.
 */
export function normalizeUrl(url: string | undefined): string {
  if (!url) return ""
  try {
    const u = new URL(url)
    const path = u.pathname.length > 1 ? u.pathname.replace(/\/+$/, "") : ""
    return `${u.protocol}//${u.host}${path}${u.search}${u.hash}`
  } catch {
    return url.replace(/\/+$/, "")
  }
}

export type SavedLocation = {
  spaceId: string
  projectId: string
  categoryId: string
  groupId: string
  /** "Space › Project › Category › Group", for tooltips and notices. */
  path: string
}

/** Every place each URL is saved, keyed by normalizeUrl. */
export function buildSavedUrlIndex(spaces: SavedSpace[]): Map<string, SavedLocation[]> {
  const index = new Map<string, SavedLocation[]>()
  for (const space of spaces) {
    for (const project of space.projects) {
      for (const category of project.categories) {
        for (const group of category.groups) {
          const loc: SavedLocation = {
            spaceId: space.id, projectId: project.id, categoryId: category.id, groupId: group.id,
            path: `${space.name} › ${project.name} › ${category.name} › ${group.name}`,
          }
          const seen = new Set<string>()
          for (const tab of group.tabs) {
            const key = normalizeUrl(tab.url)
            if (!key || seen.has(key)) continue
            seen.add(key)
            const list = index.get(key)
            if (list) list.push(loc); else index.set(key, [loc])
          }
        }
      }
    }
  }
  return index
}

/** Distinct places (other than `exceptGroupId`) where any of `urls` is already saved. */
export function savedElsewhere(spaces: SavedSpace[], urls: (string | undefined)[], exceptGroupId?: string): SavedLocation[] {
  const index = buildSavedUrlIndex(spaces)
  const out = new Map<string, SavedLocation>()
  for (const url of urls) {
    for (const loc of index.get(normalizeUrl(url)) ?? []) {
      if (loc.groupId !== exceptGroupId) out.set(loc.groupId, loc)
    }
  }
  return [...out.values()]
}

/** "Saved in Work › Sprint" / "Saved in 2 places", or null when not saved. */
export function describeSaved(locations: SavedLocation[] | undefined): string | null {
  if (!locations?.length) return null
  return locations.length === 1 ? `Saved in ${locations[0].path}` : `Saved in ${locations.length} places`
}

/** Notice after a save whose URL already existed elsewhere, or null. */
export function describeAlsoSaved(paths: string[]): string | null {
  if (!paths.length) return null
  return paths.length === 1 ? `Also saved in ${paths[0]}` : `Also saved in ${paths[0]} and ${paths.length - 1} more`
}
