// Durable merge-conflict state shared across background + newtab contexts.
//
// - Boolean flag: "there is an unresolved conflict" (indicator + push gate).
// - Optional OCC payload: base/server/local(+conflicts) so any open newtab can
//   reopen the per-item resolver after a background push hit a true 409 (FE-B3).
//
// Mirrored into useSyncStore for the UI; kept in sync across tabs via storage.onChanged.
import { useSyncStore } from "~src/store/useSyncStore";
import { merge3, type Conflict } from "~src/services/spacesMerge3";
import type { SavedSpace } from "~src/types";

export const CONFLICT_PENDING_KEY = "flextab_conflict_pending";
export const OCC_CONFLICT_PAYLOAD_KEY = "flextab_occ_conflict";

export type OccConflictPayload = {
  base: SavedSpace[] | null;
  server: SavedSpace[];
  local: SavedSpace[];
  conflicts: Conflict[];
  at: number;
};

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

/** Forget the flag + OCC payload — on resolve, pull-overwrite, or sign-out. */
export async function clearConflictPending(): Promise<void> {
  cached = false;
  loaded = true;
  useSyncStore.getState().setConflictPending(false);
  try {
    await chrome.storage.local.remove([CONFLICT_PENDING_KEY, OCC_CONFLICT_PAYLOAD_KEY]);
  } catch (_) { /* ok */ }
}

/**
 * Persist a true 3-way OCC conflict so background deferral is not lost when no
 * newtab is open, and any later newtab can open the resolver (FE-B3).
 */
export async function saveOccConflictPayload(input: {
  base: SavedSpace[] | null;
  server: SavedSpace[];
  local: SavedSpace[];
  conflicts?: Conflict[];
}): Promise<OccConflictPayload> {
  const conflicts = input.conflicts ?? merge3(input.base, input.server, input.local).conflicts;
  const payload: OccConflictPayload = {
    base: input.base,
    server: input.server,
    local: input.local,
    conflicts,
    at: Date.now(),
  };
  try {
    await chrome.storage.local.set({ [OCC_CONFLICT_PAYLOAD_KEY]: payload });
  } catch (_) { /* ok */ }
  setConflictPending(true);
  return payload;
}

export async function loadOccConflictPayload(): Promise<OccConflictPayload | null> {
  try {
    const r = await chrome.storage.local.get(OCC_CONFLICT_PAYLOAD_KEY);
    const p = r[OCC_CONFLICT_PAYLOAD_KEY] as OccConflictPayload | undefined;
    if (!p || !Array.isArray(p.server) || !Array.isArray(p.local)) return null;
    return p;
  } catch (_) {
    return null;
  }
}

/** True if a durable conflict flag is set (safe to call from background SW). */
export async function isConflictPending(): Promise<boolean> {
  try {
    const r = await chrome.storage.local.get(CONFLICT_PENDING_KEY);
    return r[CONFLICT_PENDING_KEY] === true;
  } catch (_) {
    return false;
  }
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
