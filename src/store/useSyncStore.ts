import { create } from "zustand"
import type { SyncLimitNotice } from "~src/services/syncLimit"

export type SyncStatus =
  | "paused" // engine not running (auto-sync off, signed out, or guest/local-only)
  | "connecting" // establishing the realtime connection (signed-in only)
  | "online" // connected, changes flow in realtime (signed-in only)
  | "offline" // signed-in, engine running, transport down (will retry) — NOT guest
  | "syncing" // a manual / one-shot sync is in progress (signed-in only)
  | "error" // last sync attempt failed (signed-in only)

interface SyncState {
  status: SyncStatus
  lastSyncedAt: number | null
  // Local data is ahead of the last state the server confirmed (the sync
  // merge-base): there are edits not yet pushed. True while auto-sync is off /
  // offline with pending changes; clears once a push lands. Drives the
  // "unsynced changes" hint on the global indicator.
  dirty: boolean
  // A merge conflict was detected and abandoned (the user hit "Pause sync and decide later",
  // which turns auto-sync off) — so the paused state isn't ordinary "unsynced",
  // it needs the conflict resolved. Persisted (via services/conflictState) so it
  // survives a reload; cleared once the data converges. Takes visual priority
  // over `dirty` on the indicator.
  conflictPending: boolean
  // The server refused the last push over a plan limit (TASK-9). Sync stays
  // paused until a push lands, so this is a lasting state, not a toast.
  // Mirrors chrome.storage (services/syncLimit) via useBackgroundNotices.
  limit: SyncLimitNotice | null
  setStatus: (status: SyncStatus) => void
  setDirty: (dirty: boolean) => void
  setConflictPending: (conflictPending: boolean) => void
  setLimit: (limit: SyncLimitNotice | null) => void
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
  dirty: false,
  conflictPending: false,
  limit: null,
  setStatus: (status) => set({ status }),
  setDirty: (dirty) => set({ dirty }),
  setConflictPending: (conflictPending) => set({ conflictPending }),
  setLimit: (limit) => set({ limit }),
  markSynced: () => set({ lastSyncedAt: Date.now() }),
  reset: () => set({ status: "paused", lastSyncedAt: null, dirty: false, conflictPending: false, limit: null }),
}))

/** Display metadata per status — shared by the settings tab + the global indicator. */
export const SYNC_STATUS_META: Record<SyncStatus, { label: string; color: string; pulse?: boolean }> = {
  online:     { label: "Connected",     color: "#22c55e" },
  connecting: { label: "Connecting…",   color: "#eab308", pulse: true },
  syncing:    { label: "Syncing…",      color: "#eab308", pulse: true },
  offline:    { label: "Offline",       color: "#a3a3a3" },
  paused:     { label: "Auto-sync off", color: "#a3a3a3" },
  error:      { label: "Sync error",    color: "rgb(var(--danger))" },
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
