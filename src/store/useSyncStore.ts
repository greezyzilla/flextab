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

/** Display metadata per status — shared by the settings tab + the global indicator. */
export const SYNC_STATUS_META: Record<SyncStatus, { label: string; color: string; pulse?: boolean }> = {
  online:     { label: "Connected",     color: "#22c55e" },
  connecting: { label: "Connecting…",   color: "#eab308", pulse: true },
  syncing:    { label: "Syncing…",      color: "#eab308", pulse: true },
  offline:    { label: "Offline",       color: "#a3a3a3" },
  paused:     { label: "Auto-sync off", color: "#a3a3a3" },
  error:      { label: "Sync error",    color: "#ef4444" },
}

export function formatRelativeTime(ts: number | null): string {
  if (!ts) return "Not synced yet"
  const diff = Date.now() - ts
  if (diff < 5_000) return "Just now"
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}
