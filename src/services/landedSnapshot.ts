import { doc, getSpaces, setSpaces, persistState } from "~src/lib/yjsDoc";
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

/** Called only by a hydrated page, never by the worker's empty Y.Doc. */
export function applyPendingLandedSnapshot(): Promise<void> {
  if (inFlight) return inFlight;
  // Serialize receipt consumption across open extension pages as well. Chrome
  // provides Web Locks; the fallback supports non-browser test environments.
  const work = globalThis.navigator?.locks
    ? navigator.locks.request("flextab-landed-snapshot", consume)
    : consume();
  inFlight = work.finally(() => { inFlight = null; });
  return inFlight;
}

async function consume(): Promise<void> {
  const stored = await chrome.storage.local.get(LANDED_SNAPSHOT_KEY);
  const receipt = stored[LANDED_SNAPSHOT_KEY] as LandedSnapshot | undefined;
  if (!receipt) return;

  // Persist the receipt id in the same Y.Doc as its applied result. A failed
  // write/reload must not reapply the delta and resurrect a subsequently deleted
  // remote item. Capture current local *after* the asynchronous storage read.
  const sync = doc.getMap("sync");
  if (sync.get("landedReceipt") !== receipt.id) {
    const local = getSpaces();
    const { merged, conflicts } = merge3(receipt.local, receipt.landed, local);
    if (conflicts.length > 0) {
      await saveOccConflictPayload({ base: receipt.local, server: receipt.landed, local, conflicts }, true);
      await chrome.storage.local.remove(LANDED_SNAPSHOT_KEY);
      return;
    }
    // No await between reading current local state and applying its rebased tree.
    doc.transact(() => {
      setSpaces(merged);
      sync.set("landedReceipt", receipt.id);
    });
  }
  await persistState();
  await setMergeBase(receipt.landed, true);
  await chrome.storage.local.remove(LANDED_SNAPSHOT_KEY);
}
