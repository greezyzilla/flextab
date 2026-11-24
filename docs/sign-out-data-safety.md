# Sign-out and local data

Both Account settings and the profile menu open the same sign-out dialog. Opening
or cancelling it does not revoke tokens, clear the workspace, or attempt a sync.
It always explains that signing out removes local workspace data and that edits
which have not reached the account will be lost. Offline, dirty, error, syncing,
and unresolved-conflict states show an additional warning; a clean indicator
never bypasses confirmation because it is not proof that every edit has landed.

The dialog offers **Download backup**, **Cancel**, and **Sign out and delete local
data**. The destructive action stays disabled until the user acknowledges local
data deletion. Reopening the dialog requires a fresh acknowledgement. Downloading
does not log out or select the destructive option. Export reads the live Yjs
workspace at click time, including edits made after the dialog opened, and creates
a JSON array compatible with the existing backup importer. The browser download
request is not proof the file was saved: the UI explicitly asks the user to check
it. Edits made after export need another export. Download errors leave data and
authentication untouched and clear the deletion acknowledgement.

The auth store also requires `logout({ discardLocalData: true })`. Missing or
false consent, or accidentally passing a click event, is rejected before network,
token, or workspace changes. Confirmed logout acquires the same Chrome Web Lock
as manual/background sync before revoking the session and clearing the local
workspace, revision, merge base, conflict state, and acknowledgement receipt.
This waits for cooperating in-flight sync work rather than clearing state while
that work can still record an acknowledgement. It can wait for that work/network
to finish; it does not cancel a request already sent to the server.

## Scope and verification

Sign-out does not automatically retain per-account local archives or guarantee a
download was accepted by the browser/user. A user may deliberately discard
unsynced data after confirming. Automatic sync-before-logout, account data
partitioning, interrupted cleanup recovery, and transport timeouts are not
covered. Storage cleanup is best-effort; this is not a secure-erasure guarantee.

Tests exercise both real UI entry points, offline/error/conflict/in-flight status,
Cancel, fresh consent, current-document export, download failure, logout errors,
store-level refusal without consent, and a blocked sync lock before cleanup. The
lock test simulates an in-flight operation; it is not a live multi-tab browser E2E.

Before release, load the MV3 build, make an offline edit, open each sign-out entry,
and verify Cancel preserves it. Download and inspect/import the JSON before any
intentional discard. Repeat with a quota rejection, unresolved conflict, and a
pending upload. Confirm that only the explicit delete action removes local data.
