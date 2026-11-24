import { create } from "zustand"
import type { SavedSpace } from "~src/types"
import type { Conflict } from "~src/services/spacesMerge3"

// Drives the per-item merge resolver: shown when a 3-way reconcile (base vs
// server vs local) finds true conflicts — same field edited differently on both
// sides, or an item deleted on one side and edited on the other. Holds the raw
// base/server/local so the modal can re-run merge3 with the user's per-item
// choices and preview the result before applying.
interface MergeConflictState {
  pending: boolean
  conflicts: Conflict[]
  base: SavedSpace[] | null
  server: SavedSpace[]
  local: SavedSpace[]
  open: (conflicts: Conflict[], base: SavedSpace[] | null, server: SavedSpace[], local: SavedSpace[]) => void
  close: () => void
}

export const useMergeConflict = create<MergeConflictState>((set) => ({
  pending: false,
  conflicts: [],
  base: null,
  server: [],
  local: [],
  open: (conflicts, base, server, local) => set({ pending: true, conflicts, base, server, local }),
  close: () => set({ pending: false, conflicts: [], base: null, server: [], local: [] }),
}))
