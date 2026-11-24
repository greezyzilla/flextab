/**
 * Hash route of the full sign-in screen (all providers + email). Reachable
 * from the rail, the popup and the getting-started card, so signing in never
 * jumps straight into one provider. The workspace itself is always local and
 * usable: an account only adds sync.
 */
export const SIGN_IN_ROUTE = "/signin"

/** URL of the new tab page's sign-in screen, for opening it from the popup. */
export function signInPageUrl(): string {
  return `${chrome.runtime.getURL("newtab.html")}#${SIGN_IN_ROUTE}`
}
