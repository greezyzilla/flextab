import type { PlasmoCSConfig } from "plasmo"

// Fallback OAuth token capture, injected by the browser on the backend's
// auth-success page — independent of the service worker.
//
// The primary capture lives in `background.ts` (chrome.tabs.onUpdated), which
// also closes the tab. But an MV3 service worker can be asleep or (in dev) dead;
// if it fails to run, the token is never saved and login silently breaks (the
// user is stranded on the "Login Success" page). A content script runs whenever
// the page loads regardless of SW state and can write chrome.storage directly,
// so this guarantees the tokens land. Idempotent with the SW path (same value);
// we just can't close the tab from here.
//
// `matches` must be static literals — Plasmo does NOT substitute process.env in
// the content-script config (it's extracted before env inlining), so the host is
// hardcoded to the deployed API domain. No wildcard hosts (that would scare users
// with an all-sites permission and let a hostile page inject tokens) and no
// localhost (keeps the prod permissions clean — in dev the service worker is the
// capture path and is easy to reload). As defence in depth we still verify the
// live origin against PLASMO_PUBLIC_API_URL (inlined into the bundle) before
// writing, so an unexpected match can't seed tokens.
export const config: PlasmoCSConfig = {
  matches: ["https://api.flextabmanager.com/*"],
  run_at: "document_start",
  all_frames: false,
}

const AUTH_SUCCESS_PATH = "/auth/success"

try {
  const expectedOrigin = new URL(process.env.PLASMO_PUBLIC_API_URL ?? "").origin
  if (
    window.location.origin === expectedOrigin &&
    window.location.pathname === AUTH_SUCCESS_PATH &&
    window.location.hash
  ) {
    const params = new URLSearchParams(window.location.hash.slice(1))
    const access_token = params.get("access_token")
    const refresh_token = params.get("refresh_token")
    const expires_at = params.get("expires_at")

    if (access_token && refresh_token && expires_at) {
      // Fire-and-forget: straight to the storage backend, no SW needed. The open
      // new-tab's useAuthStore picks it up via chrome.storage.onChanged.
      void chrome.storage.local.set({
        auth_tokens: { access_token, refresh_token, expires_at: Number(expires_at) },
      })
    }
  }
} catch (_) {
  // No extension context / bad env / storage unavailable — nothing to do; the SW
  // path remains as the other line of defense.
}
