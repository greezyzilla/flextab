/**
 * The page side of an update (see services/updateFlow.ts). Before the
 * background reloads the extension into a new version, it asks every open
 * FlexTab page to finish what it is writing; the page answers once it has.
 */
import { flushPersist } from "~src/lib/yjsDoc"
import { waitForTokenRefresh } from "./api"
import { flushSettingsSync } from "./settingsSync"
import { PREPARE_UPDATE_MESSAGE } from "./updateFlow"

/** Finishes the workspace write, the settings merge base and a token refresh in flight. */
export async function flushPendingWrites(): Promise<void> {
  await Promise.allSettled([flushPersist(), flushSettingsSync(), waitForTokenRefresh()])
}

export function installUpdatePrepareListener(): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== PREPARE_UPDATE_MESSAGE) return
    void flushPendingWrites().then(() => sendResponse({ ok: true }))
    return true // answers asynchronously
  })
}
