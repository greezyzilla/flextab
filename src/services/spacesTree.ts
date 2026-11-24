// Shared pure helpers for the spaces tree (FE-C3).
// Neither merge algorithm lives here — import merge3 or mergeSpacesGuest explicitly.
import type { SavedSpace } from "~src/types"

/** Count tabs under a space (defensive at every depth). */
export function spaceTabCount(s: SavedSpace): number {
  let n = 0
  for (const p of s.projects || []) {
    for (const c of p.categories || []) {
      for (const g of c.groups || []) n += g.tabs?.length || 0
    }
  }
  return n
}

/** True if any space has at least one tab. */
export function spacesHaveTabs(spaces: SavedSpace[]): boolean {
  return spaces.some((s) => spaceTabCount(s) > 0)
}
