import { apiFetch } from "./api";
import type { SavedSpace } from "~src/types";

export interface SnapshotInfo {
  revision: number;
  created_at: string;
  space_count: number;
  tab_count: number;
  // "before_resolution": the account's tabs kept when a sync conflict was resolved.
  // "" or missing (older servers): an ordinary synced state.
  kind?: string;
  // A small version's shape for the preview skeleton: per space, the tab count of each
  // group holding tabs. Sent only for versions the preview opens fully; missing on older servers.
  shape?: number[][];
}

/** List the account's version history (metadata only), newest first. */
export async function apiListSnapshots(): Promise<SnapshotInfo[]> {
  const res = await apiFetch<{ snapshots: SnapshotInfo[] }>("/api/snapshots");
  return res.snapshots ?? [];
}

/** Fetch the full stored tree for one version (for preview). */
export async function apiGetSnapshot(revision: number): Promise<SavedSpace[]> {
  const res = await apiFetch<{ spaces: SavedSpace[] }>(`/api/snapshots/${revision}`);
  return res.spaces ?? [];
}

/** Restore a version. The server snapshots the current state first (undoable)
 *  and returns the new revision. Returns it so the caller can re-pull. */
export async function apiRestoreSnapshot(revision: number): Promise<number> {
  const res = await apiFetch<{ revision: number }>(`/api/snapshots/${revision}/restore`, { method: "POST" });
  return res.revision;
}
