/**
 * "Keep tabs on this device" sign-out marker (TASK-11).
 *
 * After a kept sign-out the device still holds the previous account's tabs.
 * The next sign-in, to any account, must ask before those tabs go anywhere,
 * even into an empty account, where reconciliation would otherwise upload
 * them silently. The marker forces that choice once, then is cleared.
 */
export const KEPT_ON_SIGNOUT_KEY = "flextab_kept_on_signout"

export async function markKeptOnSignOut(): Promise<void> {
  try { await chrome.storage.local.set({ [KEPT_ON_SIGNOUT_KEY]: true }) } catch (_) { /* ok */ }
}

export async function loadKeptOnSignOut(): Promise<boolean> {
  try { return (await chrome.storage.local.get(KEPT_ON_SIGNOUT_KEY))[KEPT_ON_SIGNOUT_KEY] === true } catch (_) { return false }
}

export async function clearKeptOnSignOut(): Promise<void> {
  try { await chrome.storage.local.remove(KEPT_ON_SIGNOUT_KEY) } catch (_) { /* ok */ }
}
