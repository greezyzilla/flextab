import { doc, getSpaces, applySpaces, catchUpFromStorage, persistState } from "~src/lib/yjsDoc";
import { canonicalSpaces } from "~src/lib/canonicalSpaces";
import { withSyncWriteLock } from "./syncPolicy";
import type { SavedSpace } from "~src/types";
import { setMergeBase } from "./mergeBase";
import { merge3 } from "./spacesMerge3";
import { saveOccConflictPayload } from "./conflictState";

export const LANDED_SNAPSHOT_KEY = "flextab_landed_snapshot";

type LandedSnapshot = {
  id: string;
  local: SavedSpace[];
  landed: SavedSpace[];
};

/** Acknowledgements never replace durable workspace data from the worker. */
export async function recordLandedSnapshot(landed: SavedSpace[], local: SavedSpace[]): Promise<void> {
  if (JSON.stringify(landed) === JSON.stringify(local)) {
    // Ordinary success: edits made since this request remain in the live doc and
    // storage, and are still dirty relative to this exact server-confirmed base.
    await setMergeBase(landed, true);
    return;
  }
  // OCC produced remote changes. Keep the ancestor until a live page can rebase
  // synchronously against its current doc (including edits not yet persisted).
  // This also avoids a storage.get/storage.set check-then-overwrite race.
  const receipt: LandedSnapshot = { id: crypto.randomUUID(), local, landed };
  await chrome.storage.local.set({ [LANDED_SNAPSHOT_KEY]: receipt });
}

let inFlight: Promise<void> | null = null;

function consumeLocked(): Promise<void> {
  // Serialize receipt consumption across open extension pages as well. Chrome
  // provides Web Locks; the fallback supports non-browser test environments.
  return Promise.resolve(globalThis.navigator?.locks
    ? navigator.locks.request("flextab-landed-snapshot", consume)
    : consume());
}

/**
 * Called only by a hydrated page, never by the worker's empty Y.Doc.
 * Applying a receipt writes the doc like a reconcile does, so it runs under the
 * same sync lock: two pages must never insert the same server items at once.
 * `syncLockHeld`: the caller (Sync now) already holds it; Web Locks are not
 * re-entrant, so that call must neither wait for it nor join a flight that does.
 */
export function applyPendingLandedSnapshot(syncLockHeld = false): Promise<void> {
  if (syncLockHeld) return consumeLocked();
  if (inFlight) return inFlight;
  inFlight = (async () => {
    // Most calls find no receipt: do not queue behind a push or reconcile for nothing.
    const stored = await chrome.storage.local.get(LANDED_SNAPSHOT_KEY);
    if (!stored[LANDED_SNAPSHOT_KEY]) return;
    await withSyncWriteLock(consumeLocked);
  })().finally(() => { inFlight = null; });
  return inFlight;
}

async function consume(): Promise<void> {
  const stored = await chrome.storage.local.get(LANDED_SNAPSHOT_KEY);
  const receipt = stored[LANDED_SNAPSHOT_KEY] as LandedSnapshot | undefined;
  if (!receipt) return;

  // Persist the receipt id in the same Y.Doc as its applied result. A failed
  // write/reload must not reapply the delta and resurrect a subsequently deleted
  // remote item. Capture current local *after* the asynchronous storage read.
  // Merge against everything this device holds, not a copy that trails
  // storage; this also brings in the receipt id when another page applied it.
  await catchUpFromStorage();
  const sync = doc.getMap("sync");
  if (sync.get("landedReceipt") !== receipt.id) {
    const local = canonicalSpaces(getSpaces());
    const { merged, conflicts } = merge3(receipt.local, receipt.landed, local);
    if (conflicts.length > 0) {
      await saveOccConflictPayload({ base: receipt.local, server: receipt.landed, local, conflicts }, true);
      await chrome.storage.local.remove(LANDED_SNAPSHOT_KEY);
      return;
    }
    // No await between reading current local state and applying its rebased tree.
    doc.transact(() => {
      applySpaces(merged);
      sync.set("landedReceipt", receipt.id);
    });
  }
  await persistState();
  await setMergeBase(receipt.landed, true);
  await chrome.storage.local.remove(LANDED_SNAPSHOT_KEY);
}
