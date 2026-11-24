/**
 * Whether FlexTab may reach its server (TASK-112). Two things can take that away
 * after install, and either one stops sync without an error worth showing:
 * - the host permission for the API: Firefox and Chrome both let the user turn a
 *   site's access off for an extension;
 * - in Firefox, the data collection consent (manifest
 *   gecko.data_collection_permissions, all optional): nothing leaves the device
 *   until the user agrees, which FlexTab asks for when they sign in.
 * Without access, sync says so ("Sync off") and offers to allow it again.
 */
import { isFirefox } from "~src/lib/browserKind"

const API_HOST = process.env.PLASMO_PUBLIC_API_HOST || "http://localhost/*"

/** What a signed-in FlexTab sends: the account email, sign-in data, saved tabs (bookmark-like), the device id. */
export const DATA_COLLECTION = ["personallyIdentifyingInfo", "authenticationInfo", "bookmarksInfo", "technicalAndInteraction"]

type AccessPermissions = chrome.permissions.Permissions & { data_collection?: string[] }

export function accessPermissions(): AccessPermissions {
  return isFirefox() ? { origins: [API_HOST], data_collection: DATA_COLLECTION } : { origins: [API_HOST] }
}

/** True outside an extension (tests, plain pages), where there is nothing to ask. */
export async function hasApiAccess(): Promise<boolean> {
  if (typeof chrome === "undefined" || typeof chrome.permissions?.contains !== "function") return true
  try {
    return await chrome.permissions.contains(accessPermissions())
  } catch (_) {
    return true // a browser that cannot answer has not taken access away
  }
}

/**
 * Asks for access. Browsers only show the prompt from a user gesture, so call it
 * synchronously inside the click or submit, before any await. Resolves at once,
 * without a prompt, when access is already there.
 */
export function requestApiAccess(): Promise<boolean> {
  if (typeof chrome === "undefined" || typeof chrome.permissions?.request !== "function") return Promise.resolve(true)
  try {
    return chrome.permissions.request(accessPermissions()).then((granted) => granted, () => false)
  } catch (_) {
    return Promise.resolve(false)
  }
}

/** Reports access now and every time it changes. Returns the unsubscribe. */
export function watchApiAccess(onChange: (allowed: boolean) => void): () => void {
  const check = () => { void hasApiAccess().then(onChange) }
  check()
  type Event = { addListener: (fn: () => void) => void; removeListener?: (fn: () => void) => void }
  const events = [chrome.permissions?.onAdded, chrome.permissions?.onRemoved] as (Event | undefined)[]
  for (const event of events) event?.addListener(check)
  return () => { for (const event of events) event?.removeListener?.(check) }
}
