# Correlated OAuth login

Google/GitHub sign-in starts through the background worker (`flextab.oauth.start`) from a trusted extension page. The worker creates a private S256 verifier and a separate random nonce, stores the attempt in `chrome.storage.session`, and binds it to the tab it opens. Pending attempts expire after ten minutes; a new attempt supersedes the previous one.

`/auth/success` must return a one-time code and the original nonce. Both the content-script notification and tabs listener pass through the same worker completion path. Raw access/refresh tokens in URL fragments are always rejected. The content script only sends a wake-up message and never stores credentials.

The worker checks sender/frame, origin/path, tab, nonce, expiry, and existing credentials; consumes the local attempt; then posts code/verifier/nonce to `/api/auth/oauth/exchange`. Duplicate messages cannot install credentials twice. It rechecks the tab and credentials after the response and clears sync hydration before credentials are published. A signed-in user must sign out explicitly before another OAuth login; a delayed storage event cannot re-save an older session.

A failed/lost exchange, closed tab, worker interruption during exchange, browser restart, or extension reload can require starting login again. The code is intentionally not replayed automatically. The callback page provides that retry instruction. Existing guest workspace is preserved and still uses the existing sync reconciliation flow; this is not account-specific workspace isolation.

The backend side is described in the backend's `docs/oauth-extension-login.md`. It requires S256 and a nonce and never emits token fragments, so this flow only completes against a backend that implements it.

Tests exercise forged callbacks, mismatched/expired attempts, duplicate notifications, worker restart, storage/network failures, closed/navigated tabs, newer sessions, and both provider start actions. The generated manifest contains only the intended content script on the API host. Live provider consent in an installed Chrome extension is a release check.
