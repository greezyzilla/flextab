import type { SavedSpace } from "~src/types"
import { spacesHaveTabs } from "~src/services/spacesTree"

/**
 * Hash route of the full sign-in screen (all providers + email). Reachable
 * from the rail, the popup and the first-run wall, so signing in never jumps
 * straight into one provider.
 */
export const SIGN_IN_ROUTE = "/signin"

/**
 * One rule for "may this device use the workspace", shared by the new tab
 * page and the popup (TASK-3): signed in, chose guest mode, or still holds
 * real tabs from an earlier session (e.g. an expired login). A fresh,
 * signed-out install gets the first-run screen instead.
 */
export function canUseWorkspace(args: {
  isAuthenticated: boolean
  guestMode: boolean
  spaces: SavedSpace[]
}): boolean {
  return args.isAuthenticated || args.guestMode || spacesHaveTabs(args.spaces)
}

/** URL of the new tab page's sign-in screen, for opening it from the popup. */
export function signInPageUrl(): string {
  return `${chrome.runtime.getURL("newtab.html")}#${SIGN_IN_ROUTE}`
}
