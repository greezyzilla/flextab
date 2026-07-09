// Persisted "a merge conflict is unresolved" flag. Set when the user abandons
// the merge resolver ("Ignore for now" → auto-sync off), so a later reload still
// knows the paused state is a conflict — not ordinary unsynced edits — until the
// data converges. Mirrored into useSyncStore for the indicator, and kept in sync
// across contexts (multiple new-tab pages) via storage.onChanged.
import { useSyncStore } from "~src/store/useSyncStore";

const CONFLICT_PENDING_KEY = "flextab_conflict_pending";

let cached = false;
let loaded = false;

/** Read the persisted flag once and seed the store; cheap on repeat (cached). */
export async function loadConflictPending(): Promise<boolean> {
  if (!loaded) {
    try {
      const r = await chrome.storage.local.get(CONFLICT_PENDING_KEY);
      cached = r[CONFLICT_PENDING_KEY] === true;
    } catch (_) { /* no extension context */ }
    loaded = true;
  }
  useSyncStore.getState().setConflictPending(cached);
  return cached;
}

export function setConflictPending(v: boolean): void {
  cached = v;
  loaded = true;
  useSyncStore.getState().setConflictPending(v);
  try { void chrome.storage.local.set({ [CONFLICT_PENDING_KEY]: v }); } catch (_) { /* ok */ }
}

/** Forget the flag — on sign-out (per-account, like the merge base). */
export async function clearConflictPending(): Promise<void> {
  cached = false;
  loaded = true;
  useSyncStore.getState().setConflictPending(false);
  try { await chrome.storage.local.remove(CONFLICT_PENDING_KEY); } catch (_) { /* ok */ }
}

// Keep other contexts (a second new-tab page) in step when the flag flips.
if (chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[CONFLICT_PENDING_KEY]) {
      cached = changes[CONFLICT_PENDING_KEY].newValue === true;
      loaded = true;
      useSyncStore.getState().setConflictPending(cached);
    }
  });
}
