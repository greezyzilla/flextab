// The merge-base for 3-way sync: the last spaces snapshot this device
// successfully synced with the server (the common ancestor, git-style). Stored
// locally per account and updated on every converged reconcile/push. `merge3`
// diffs base→server and base→local against this to tell an edit from a delete.
//
// Null base (fresh account / pre-3-way installs) → merge3 degrades to a lossless
// union, so this is safe to be absent.
import type { SavedSpace } from "~src/types";

const MERGE_BASE_KEY = "flextab_merge_base";

let cached: SavedSpace[] | null = null;
let loaded = false;

export async function getMergeBase(): Promise<SavedSpace[] | null> {
  if (loaded) return cached;
  try {
    const result = await chrome.storage.local.get(MERGE_BASE_KEY);
    const v = result[MERGE_BASE_KEY];
    if (Array.isArray(v)) cached = v as SavedSpace[];
  } catch (_) { /* no extension context */ }
  loaded = true;
  return cached;
}

export async function setMergeBase(spaces: SavedSpace[], requireDurable = false): Promise<void> {
  // Deep clone so a later in-place doc mutation can't retroactively change the base.
  const next = JSON.parse(JSON.stringify(spaces)) as SavedSpace[];
  try { await chrome.storage.local.set({ [MERGE_BASE_KEY]: next }); }
  catch (error) { if (requireDurable) throw error; }
  cached = next;
  loaded = true;
}

/** Forget the base (on sign-in/out — it's per-account). */
export async function clearMergeBase(): Promise<void> {
  cached = null;
  loaded = false; // next get re-reads storage (which we've just cleared)
  try { await chrome.storage.local.remove(MERGE_BASE_KEY); } catch (_) { /* ok */ }
}

// Keep the in-memory cache fresh when the background worker updates the base.
if (chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[MERGE_BASE_KEY]) {
      const v = changes[MERGE_BASE_KEY].newValue;
      cached = Array.isArray(v) ? (v as SavedSpace[]) : null;
      loaded = true;
    }
  });
}
