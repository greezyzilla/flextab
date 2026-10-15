import type { PlasmoCSConfig } from "plasmo"

// Wake the worker on the callback page. The worker validates the browser's
// sender URL, top-level tab, pending attempt, and PKCE exchange. This script
// never writes credentials or reads the private verifier from session storage.
export const config: PlasmoCSConfig = {
  matches: ["https://api.flextabmanager.com/*"],
  run_at: "document_start",
  all_frames: false,
}

try {
  const expectedOrigin = new URL(process.env.PLASMO_PUBLIC_API_URL ?? "").origin
  if (window.location.origin === expectedOrigin && window.location.pathname === "/auth/success") {
    void chrome.runtime.sendMessage({ type: "flextab.oauth.callback" }).catch(() => {})
  }
} catch (_) {
  // No extension context or invalid configuration: do not accept credentials.
}
