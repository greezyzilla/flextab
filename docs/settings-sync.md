# Account settings sync lifecycle

DAT-17, 2026-10-20. This service syncs the six account preferences (layout,
columns, density, hue, intensity, Auto-sync), independently of workspace sync.

## Session ownership

- A pull or running settings subscription captures the current generation and
  requires an authenticated account with a known user ID. Capture happens before
  debounce/retry timers, Web Locks or API I/O.
- An auth status or user-ID change stops the subscription, cancels timers,
  advances the generation, and clears the old account's merge base/last-pushed
  value. Logout/relogin of the same account invalidates old work too. Refreshing
  profile fields with the same ID does not invalidate it.
- Stop/unmount also invalidates requests already in flight. A later restart
  cannot revive them.
- GET/PUT sequences use `flextab-structured-sync`, the same Web Lock used by
  accepted login/logout. Session guards are checked after acquiring the lock
  and after each API response, before another request or local/bookkeeping
  mutation. A failed old push cannot schedule a retry for a new session.
- Accepted login clears the old profile before releasing that lock. Settings
  wait for the new `/me` identity, including if profile loading fails. New-tab's
  effect depends on both authentication and user ID, so it starts after identity
  loading and restarts on an account switch that stays authenticated.
- Empty-account seeding records its base only after a successful PUT belonging
  to the same session. A stale seed acknowledgement cannot replace a newer base.

## Verification

`settingsSync.integration.test.ts` exercises the real settings store and service
with deferred API responses, auth-state changes and simulated lock queues.
Six initial cases failed before the repair: old pulls (empty/populated), push
GET, push acknowledgement, same-account relogin and stop during pull.
Additional cases cover lock queues, stale retries, already-dispatched timers,
seed acknowledgement, unknown identity and same-ID profile refresh.

`newtab/index.test.tsx` verifies startup after profile identity, restart on ID
change, no restart on same-ID refresh, and stop on logout/unmount.
`useAuthStore.test.ts` verifies clearing old identity during successful and
failed profile loads after accepting new login credentials.

## Limits

The guard observes auth-store transitions in a page. It is not storage partitioning
per account or proof of native Chrome multi-profile isolation. A PUT already sent
cannot be recalled; its late completion is ignored locally. Token replacements
not reflected in this page's auth store, stale competing `/me` responses, and
same-session edits made during a settings response remain separate lifecycle
concerns. Browser Web Locks coordinate normal login/logout paths; environments
without Web Locks retain the existing fallback, with generation checks but no
cross-context serialization. Tests use synthetic accounts and mocked HTTP,
not production sign-in or a native two-account browser session.
