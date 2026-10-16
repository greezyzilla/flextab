# Manual sync and automatic sync

Turning **Auto-sync Off** pauses automatic workspace traffic. **Sync now** is an
explicit one-shot operation: it pulls the account, reconciles local changes, and
waits for any necessary upload acknowledgement. It does not turn auto-sync on,
open a WebSocket, or set the worker's hydration gate. Edits made afterwards stay
local until another manual sync or until auto-sync is enabled.

The worker reads `state.autoSync` from the existing `flextab-settings` JSON string
in `chrome.storage.local`, rather than importing an unhydrated Zustand store.
Missing settings retain the existing default-on behavior, subject to successful
account hydration. Malformed settings or failed reads pause uploads. Settings
changes in other open pages are rehydrated from the latest persisted record.

All automatic worker triggers share the same policy: storage debounce, startup,
retry alarm, receipt consumption, trailing passes, and OCC retries. Permission is
checked again after asynchronous token/device lookup immediately before fetch.
Turning Off clears a queued debounce and prevents further automatic attempts.
The durable pending marker is retained so work is not lost when syncing resumes.
A request already sent may still commit; its acknowledgement is recorded safely,
but it does not authorize another upload. Off cannot undo an accepted server write.

Automatic page pulls and WebSocket setup check engine generation and the current
preference after awaited work. Late responses and token lookups from a stopped
engine cannot reopen a connection or apply an obsolete automatic pull. Startup
waits for persisted settings hydration before consulting the default-on state.
Manual sync, automatic reconciliation, restore pulls, and background writes use
the same Chrome Web Lock to serialize shared revision/receipt work across extension
contexts. Environments without Web Locks use the existing OCC safety net.

## Manual outcomes

`syncNow` returns a structured outcome and Settings displays the corresponding
message. It never reports success simply because a pull was attempted.

- `ok`: the pull matched the account or the required PUT was acknowledged.
- `offline`: the account pull could not complete.
- `conflict`: user resolution is needed; no conflicting replacement is uploaded.
- `limit`: the size/plan rejection is displayed, with local edits retained.
- `error`: another sync/storage/upload failure occurred; the user can retry.
- `signed_out`: there is no authenticated session authorizing the operation.

Concurrent clicks share the same in-flight manual operation. Edits made during
an upload remain local and dirty relative to its exact acknowledged snapshot;
manual sync does not loop forever trying to drain later edits. When paused, an
explicit conflict resolution remains ready for the next **Sync now** in that
page, using OCC against the revision shown to the user. It does not immediately
upload or discard the choice by re-pulling the same conflict. Closing/reloading
the page can require reconciliation again; local data remains persisted.

## Session ownership of queued and pending pulls

Page sync operations capture their authenticated session before waiting for the
structured-sync lock. Logout/login or a user ID change invalidates that captured
session, including signing back into the same account. A profile refresh that
keeps the same user ID and authenticated state does not invalidate it.

Manual sync and restore pulls queued by an older session do not start a request
under a later session. A restore response arriving after a session change is
discarded before writing its revision or applying its workspace. Manual sync
returns `signed_out`, restore pulls return `false`, and stale completion/error
handlers leave the newer session's sync status alone. Automatic reconciliation
also captures engine generation before the lock, so restarting the engine does
not revive a pull queued by the stopped engine. Startup and manual preparation
recheck ownership after asynchronous reads, before starting the next stage.

The guard uses auth-store transitions observed in this page. It does not partition
storage by account, cancel a storage write already issued, or retroactively undo
an HTTP request already sent. Existing Web Locks still serialize participating
login/logout and sync writers. Token changes not reflected in the auth store,
worker/account ownership, and invalidation during an already-started local apply
need their own lifecycle guarantees; this is not a claim of complete account
isolation across extension contexts.

## Verification and scope

Regression tests exercise real production worker triggers with simulated Chrome
storage, page engine lifecycle with deferred requests/WebSockets, and the Settings
UI. They cover Off with a stale true hydration flag, debounce cancellation, startup
and retry alarms, Off during upload/409/token refresh, delayed pull/socket setup,
manual success/offline/limit/error/conflict, conflict continuation, repeated clicks,
and edits during acknowledgement. Settings tests cover another page's Off update
without writing an older settings snapshot back.

Session tests defer the structured-sync lock, API response, fresh-login flag
read, and revision storage separately. They cover account switch, logout/login,
same-account relogin, signed-out calls queued before login, old request failure,
automatic engine restart, and a same-session/profile-refresh control. The tests
use the production sync engine and Yjs document with simulated auth, API, locks,
and Chrome storage.

These are automated extension-runtime simulations, not a live Chrome/provider or
production-server E2E run. Before release, load the built MV3 extension, sign in,
turn Off, run Sync now, and verify subsequent local edits produce no PUT or WS
reconnect; repeat across two new-tab pages and after restarting the worker.

This change governs workspace automatic sync. Account preference synchronization
(theme/layout and the existing account-level autoSync preference) retains its
existing separate lifecycle. Empty-tree synchronization (DAT-12), sign-out data
preservation (DAT-09), and account ownership isolation remain separate findings.
No schema migration, backend deployment, or production data change is required.
