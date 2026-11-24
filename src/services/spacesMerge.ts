// LEGACY 2-way merge — guest / no-merge-base only (FE-C3).
//
// Production OCC, multi-device reconcile with a merge-base, and 409 writeback
// use `spacesMerge3.merge3` exclusively. Do NOT use this module for those paths.
//
// Allowed call sites:
//   - guest ↔ account sign-in (SyncConflictModal preview + resolveChoice)
//   - first sync when merge-base is null (decideReconciliation fallback)
//
// Diff vs merge3: drops empty local "Personal" placeholder when the account
// already has spaces; no delete-vs-edit awareness (no base).
import type { SavedSpace, SavedProject, SavedCategory, SavedGroup } from "~src/types"
import { spaceTabCount } from "./spacesTree"

export { spaceTabCount } from "./spacesTree"

// Union two arrays by id; on a collision the children are deep-merged. Order:
// a (server) items first, then b-only (local) items, with order reindexed.
function unionById<T extends { id: string; order?: number }>(
  a: T[], b: T[], deepMerge: (x: T, y: T) => T,
): T[] {
  const byId = new Map<string, T>()
  for (const x of a) byId.set(x.id, x)
  for (const y of b) {
    const existing = byId.get(y.id)
    byId.set(y.id, existing ? deepMerge(existing, y) : y)
  }
  return [...byId.values()].map((x, i) => ({ ...x, order: i }))
}

function mergeGroup(a: SavedGroup, b: SavedGroup): SavedGroup {
  // Union tabs by id (keep the server copy on collision); never drop a tab.
  return { ...a, tabs: unionById(a.tabs || [], b.tabs || [], (x) => x) }
}
function mergeCategory(a: SavedCategory, b: SavedCategory): SavedCategory {
  return { ...a, groups: unionById(a.groups || [], b.groups || [], mergeGroup) }
}
function mergeProject(a: SavedProject, b: SavedProject): SavedProject {
  return { ...a, categories: unionById(a.categories || [], b.categories || [], mergeCategory) }
}
function mergeSpace(a: SavedSpace, b: SavedSpace): SavedSpace {
  return { ...a, projects: unionById(a.projects || [], b.projects || [], mergeProject) }
}

/**
 * Lossless 2-way union (no merge-base). Spaces are unioned by id and, on a
 * collision, projects → categories → groups → tabs are recursively unioned.
 * Local-only empty default "Personal" is dropped when the account already has
 * data (guest placeholder).
 *
 * @deprecated Prefer `merge3` whenever a merge-base exists. This remains for
 * guest sign-in and no-base first sync only (FE-C3).
 */
export function mergeSpaces(server: SavedSpace[], local: SavedSpace[]): SavedSpace[] {
  return mergeSpacesGuest(server, local)
}

/** Explicit guest/legacy name — same as mergeSpaces (FE-C3). */
export function mergeSpacesGuest(server: SavedSpace[], local: SavedSpace[]): SavedSpace[] {
  const byId = new Map<string, SavedSpace>()
  for (const s of server) byId.set(s.id, s)
  for (const s of local) {
    const existing = byId.get(s.id)
    if (existing) { byId.set(s.id, mergeSpace(existing, s)); continue }
    const emptyDefault = s.name === "Personal" && spaceTabCount(s) === 0
    if (emptyDefault && server.length > 0) continue
    byId.set(s.id, s)
  }
  return [...byId.values()].map((s, i) => ({ ...s, order: i }))
}
