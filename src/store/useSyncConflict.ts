import { create } from "zustand"

// Drives the sign-in conflict modal: shown when a guest with local tabs logs
// into an account that also has tabs, so the user decides how to resolve.
interface SyncConflictState {
  pending: boolean
  serverTabs: number
  localTabs: number
  open: (serverTabs: number, localTabs: number) => void
  close: () => void
}

export const useSyncConflict = create<SyncConflictState>((set) => ({
  pending: false,
  serverTabs: 0,
  localTabs: 0,
  open: (serverTabs, localTabs) => set({ pending: true, serverTabs, localTabs }),
  close: () => set({ pending: false }),
}))
