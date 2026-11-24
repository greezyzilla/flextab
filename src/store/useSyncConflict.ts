import { create } from "zustand"
import type { SavedSpace } from "~src/types"

// Drives the sign-in conflict modal: shown when a guest with local tabs logs
// into an account that also has tabs, so the user decides how to resolve. Holds
// both candidate datasets so the modal can preview each option's result.
interface SyncConflictState {
  pending: boolean
  server: SavedSpace[]
  local: SavedSpace[]
  open: (server: SavedSpace[], local: SavedSpace[]) => void
  close: () => void
}

export const useSyncConflict = create<SyncConflictState>((set) => ({
  pending: false,
  server: [],
  local: [],
  open: (server, local) => set({ pending: true, server, local }),
  close: () => set({ pending: false, server: [], local: [] }),
}))
