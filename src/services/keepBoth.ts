// "Keep both" for a tab whose address changed differently on both sides.
// Two addresses are two pages, so both can stay: the merged tree
// keeps this device's tab and gains the account's version right after it, as
// a new tab with its own id so the next sync does not see the same conflict.
//
// It runs after merge3 on its result; merge3 itself never changes.

import { v7 as uuidv7 } from "uuid"
import type { SavedGroup, SavedSpace, SavedTab } from "~src/types"
import type { Conflict } from "./spacesMerge3"

/** Only an address conflict on a tab can keep both versions. */
export function canKeepBoth(c: Conflict, level: string): boolean {
  return c.kind === "field" && c.field === "url" && level === "tab"
}

function* groupsOf(spaces: SavedSpace[]): Generator<SavedGroup> {
  for (const s of spaces) for (const p of s.projects) for (const c of p.categories) yield* c.groups
}

function findTab(spaces: SavedSpace[], id: string): SavedTab | undefined {
  for (const g of groupsOf(spaces)) {
    const hit = g.tabs.find((t) => t.id === id)
    if (hit) return hit
  }
  return undefined
}

/**
 * Add the account's version of each kept-both tab next to this device's one.
 * `merged` must come from merge3 with those conflicts resolved to "local".
 * Returns a new tree; the input is not changed.
 */
export function addAccountCopies(merged: SavedSpace[], server: SavedSpace[], conflicts: Conflict[], newId: () => string = uuidv7): SavedSpace[] {
  if (conflicts.length === 0) return merged
  const out: SavedSpace[] = JSON.parse(JSON.stringify(merged))
  for (const c of conflicts) {
    const theirs = findTab(server, c.id)
    if (!theirs) continue
    for (const g of groupsOf(out)) {
      const i = g.tabs.findIndex((t) => t.id === c.id)
      if (i < 0) continue
      g.tabs.splice(i + 1, 0, { ...theirs, id: newId() })
      g.tabs = g.tabs.map((t, order) => ({ ...t, order }))
    }
  }
  return out
}
