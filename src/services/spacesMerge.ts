import type { SavedSpace, SavedProject, SavedCategory, SavedGroup } from "~src/types";

// Pure, dependency-free space merging — shared by the sync engine (reconcile)
// and the background worker (409 conflict reconcile), so both stay lossless.

export function spaceTabCount(s: SavedSpace): number {
  let n = 0;
  for (const p of s.projects || []) {
    for (const c of p.categories || []) {
      for (const g of c.groups || []) n += g.tabs?.length || 0;
    }
  }
  return n;
}

// Union two arrays by id; on a collision the children are deep-merged. Order:
// a (server) items first, then b-only (local) items, with order reindexed.
function unionById<T extends { id: string; order?: number }>(
  a: T[], b: T[], deepMerge: (x: T, y: T) => T,
): T[] {
  const byId = new Map<string, T>();
  for (const x of a) byId.set(x.id, x);
  for (const y of b) {
    const existing = byId.get(y.id);
    byId.set(y.id, existing ? deepMerge(existing, y) : y);
  }
  return [...byId.values()].map((x, i) => ({ ...x, order: i }));
}

function mergeGroup(a: SavedGroup, b: SavedGroup): SavedGroup {
  // Union tabs by id (keep the server copy on collision); never drop a tab.
  return { ...a, tabs: unionById(a.tabs || [], b.tabs || [], (x) => x) };
}
function mergeCategory(a: SavedCategory, b: SavedCategory): SavedCategory {
  return { ...a, groups: unionById(a.groups || [], b.groups || [], mergeGroup) };
}
function mergeProject(a: SavedProject, b: SavedProject): SavedProject {
  return { ...a, categories: unionById(a.categories || [], b.categories || [], mergeCategory) };
}
function mergeSpace(a: SavedSpace, b: SavedSpace): SavedSpace {
  return { ...a, projects: unionById(a.projects || [], b.projects || [], mergeProject) };
}

/**
 * Lossless deep merge: spaces are unioned by id and, on a collision, their
 * projects → categories → groups → tabs are recursively unioned by id too — so
 * a tab added locally to an already-synced space is never dropped. Local-only
 * spaces are kept, except the guest's empty default "Personal" when the account
 * already has data (it's just a placeholder).
 */
export function mergeSpaces(server: SavedSpace[], local: SavedSpace[]): SavedSpace[] {
  const byId = new Map<string, SavedSpace>();
  for (const s of server) byId.set(s.id, s);
  for (const s of local) {
    const existing = byId.get(s.id);
    if (existing) { byId.set(s.id, mergeSpace(existing, s)); continue; }
    const emptyDefault = s.name === "Personal" && spaceTabCount(s) === 0;
    if (emptyDefault && server.length > 0) continue;
    byId.set(s.id, s);
  }
  return [...byId.values()].map((s, i) => ({ ...s, order: i }));
}
