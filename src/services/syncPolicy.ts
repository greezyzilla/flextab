// Zustand persists this JSON string in chrome.storage.local. Read it directly in
// the worker: importing the UI store there would use an unhydrated default.
export const SETTINGS_KEY = "flextab-settings";

export function storedAutoSync(value: unknown): boolean {
  // Existing installs without a saved setting retain the product default.
  if (value === undefined) return true;
  if (typeof value !== "string") return false;
  try {
    const state = JSON.parse(value)?.state;
    return state != null && typeof state === "object" && !Array.isArray(state)
      && (state.autoSync === undefined || state.autoSync === true);
  } catch { return false; }
}

export async function automaticPushAllowed(): Promise<boolean> {
  try {
    const hydration = await chrome.storage.local.get("flextab_sync_hydrated");
    if (hydration.flextab_sync_hydrated !== true) return false;
    const settings = await chrome.storage.local.get(SETTINGS_KEY);
    return storedAutoSync(settings[SETTINGS_KEY]);
  } catch { return false; }
}

// Manual page sync and automatic worker sync share revision/receipt storage.
// Chrome Web Locks serialize the whole read/reconcile/write operation across
// contexts. The fallback supports environments without the browser API.
export function withSyncWriteLock<T>(work: () => Promise<T>): Promise<T> {
  return globalThis.navigator?.locks
    ? navigator.locks.request("flextab-structured-sync", work)
    : work();
}
