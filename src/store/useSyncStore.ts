import { create } from "zustand"

export type SyncStatus =
  | "paused" // sync engine not running (auto-sync off, or signed out)
  | "connecting" // establishing the realtime connection
  | "online" // connected, changes flow in realtime
  | "offline" // engine running but the connection is down (will retry)
  | "syncing" // a manual / one-shot sync is in progress
  | "error" // last sync attempt failed

interface SyncState {
  status: SyncStatus
  lastSyncedAt: number | null
  setStatus: (status: SyncStatus) => void
  markSynced: () => void
  reset: () => void
}

/**
 * Ephemeral realtime-sync status surfaced in the Sync settings tab. Updated by
 * the sync engine (`src/services/syncEngine.ts`); not persisted.
 */
export const useSyncStore = create<SyncState>((set) => ({
  status: "paused",
  lastSyncedAt: null,
  setStatus: (status) => set({ status }),
  markSynced: () => set({ lastSyncedAt: Date.now() }),
  reset: () => set({ status: "paused", lastSyncedAt: null }),
}))
