/**
 * "Update needed" (TASK-114). When the server answers that this version is below
 * its minimum, utils/http records UPDATE_REQUIRED_KEY. From then on:
 * - the background asks the browser for an update (installUpdateRequired), and
 *   holds every push, pending flag kept, so it does not keep knocking;
 * - the pages stop the sync engine and the sync badge says "Update needed"
 *   with "Check for update" (checkForUpdateNow);
 * - local work goes on as usual;
 * - the new version's install clears the record (installLifecycle "clearUpdateRequired").
 */
import { UPDATE_REQUIRED_KEY } from "~src/utils/http"
import { APPLY_UPDATE_NOW_MESSAGE } from "./updateFlow"

export interface UpdateRequired { minVersion: string | null; at: number }

export async function readUpdateRequired(): Promise<UpdateRequired | null> {
  try {
    return ((await chrome.storage.local.get(UPDATE_REQUIRED_KEY))[UPDATE_REQUIRED_KEY] as UpdateRequired | undefined) ?? null
  } catch (_) {
    return null
  }
}

export async function clearUpdateRequired(): Promise<void> {
  try { await chrome.storage.local.remove(UPDATE_REQUIRED_KEY) } catch (_) { /* no extension context */ }
}

/** Reports the record now and every time it changes. Returns the unsubscribe. */
export function watchUpdateRequired(onChange: (required: UpdateRequired | null) => void): () => void {
  void readUpdateRequired().then(onChange)
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === "local" && UPDATE_REQUIRED_KEY in changes) onChange((changes[UPDATE_REQUIRED_KEY].newValue as UpdateRequired | undefined) ?? null)
  }
  chrome.storage.onChanged.addListener(listener)
  return () => chrome.storage.onChanged.removeListener(listener)
}

/** Asks the browser to look for a new version now. "update_available" means one is coming. */
export async function requestUpdateCheck(): Promise<string> {
  try {
    const check = chrome.runtime.requestUpdateCheck as unknown as () => Promise<{ status?: string } | [string]>
    const result = await check()
    return Array.isArray(result) ? result[0] : result?.status ?? "no_update"
  } catch (_) {
    return "no_update" // a browser or install with nowhere to check (a temporary add-on)
  }
}

/**
 * The user's "Check for update": ask for the new version, and if one is coming,
 * install it as soon as it is ready even though FlexTab is in front: the user
 * asked for it. Resolves to the browser's answer.
 */
export async function checkForUpdateNow(): Promise<string> {
  const status = await requestUpdateCheck()
  if (status === "update_available") {
    try { await chrome.runtime.sendMessage({ type: APPLY_UPDATE_NOW_MESSAGE }) } catch (_) { /* background asleep: the update still applies when FlexTab is not in front */ }
  }
  return status
}

/** Background: ask for an update whenever the server starts refusing this version, and once at start. */
export function installUpdateRequired(): void {
  void readUpdateRequired().then((required) => { if (required) void requestUpdateCheck() })
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[UPDATE_REQUIRED_KEY]?.newValue && !changes[UPDATE_REQUIRED_KEY]?.oldValue) void requestUpdateCheck()
  })
}
