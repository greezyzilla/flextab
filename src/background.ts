import { completeOAuthLogin, registerOAuthMessages } from "~src/services/oauthLogin";
import { automaticPushAllowed, PUSH_FAILED_KEY, PUSH_REQUEST_KEY, SETTINGS_KEY, storedAutoSync, withSyncWriteLock } from "~src/services/syncPolicy";
import { loadTokens, getDeviceId, waitForTokenRefresh } from "~src/services/api";
import { syncStructuredSnapshot } from "~src/services/structuredSync";
import { merge3 } from "~src/services/spacesMerge3";
import { getMergeBase } from "~src/services/mergeBase";
import { canonicalSpaces } from "~src/lib/canonicalSpaces";
import { isConflictPending, saveOccConflictPayload, clearConflictPending } from "~src/services/conflictState";
import {
  PERSIST_KEY,
  decodeSpacesFromStorage,
  readPersistedUpdate,
} from "~src/lib/yjsDoc";
import { recordLandedSnapshot, LANDED_SNAPSHOT_KEY } from "~src/services/landedSnapshot";
import type { SavedSpace } from "~src/types";
import { clearLimitNotice, LIMIT_RECHECK_KEY, saveLimitNotice } from "~src/services/syncLimit";
import { captureFromBackground, commandKind, menuKind, registerCaptureMenus, registerPopupClose } from "~src/services/backgroundCapture";
import { installToolbarIcon } from "~src/services/toolbarIcon";
import { runInstallSteps } from "~src/services/installLifecycle";
import { seedFirstInstall } from "~src/services/firstInstall";
import { installUpdateFlow, restoreTabsAfterUpdate } from "~src/services/updateFlow";
import { hasApiAccess } from "~src/services/apiAccess";
import { clearUpdateRequired, installUpdateRequired, readUpdateRequired } from "~src/services/updateRequired";

const API_BASE_URL = process.env.PLASMO_PUBLIC_API_URL || "http://localhost:3000";
const AUTH_SUCCESS_PATH = "/auth/success";
const BILLING_SUCCESS_PATH = "/billing/success";
const BILLING_CANCEL_PATH = "/billing/cancel";
// Set after a provider-link (bind) OAuth round-trip so the open new-tab can
// refresh its linked-accounts list + toast the result.
const BIND_RESULT_KEY = "flextab_bind_result";
// Set after a checkout round-trip (see billing.go's BillingSuccessPage /
// BillingCancelPage) so the open Settings > Plan tab can toast the outcome
// and re-fetch billing status. NOT a trust signal by itself — the query
// params on the redirect are unauthenticated (anyone could craft that URL);
// the open tab re-fetches GET /billing/status for the real,
// webhook-verified confirmation rather than trusting this outcome directly.
const BILLING_RESULT_KEY = "flextab_billing_result";
const SYNC_DEBOUNCE_MS = 5000;
// Set right before a push attempt, cleared only once it's confirmed landed (or
// deliberately deferred). A push can fail for reasons that never produce
// another Yjs mutation (offline, a transient 401/5xx) — the debounce listener
// below only fires on a *new* edit, so without this flag + the periodic alarm,
// a failed push could sit unretried indefinitely until the user happens to
// edit something else or restart the browser.
const PENDING_PUSH_KEY = "flextab_push_pending";
const RETRY_ALARM = "flextab_push_retry";

// Establish the stable device id from the single background context at install
// (installLifecycle) and on every worker start, so new-tab pages read it instead
// of racing to generate one (which could register duplicate devices on a fresh install).
void getDeviceId();

// =====================================================================
// Capture from anywhere: keyboard commands + right-click menu
// =====================================================================

registerPopupClose();
installToolbarIcon();
chrome.contextMenus.onClicked.addListener((info, tab) => {
  const kind = menuKind(info.menuItemId);
  if (kind) void captureFromBackground(kind, { tab, linkUrl: info.linkUrl, linkText: info.selectionText });
});
chrome.commands.onCommand.addListener((command, tab) => {
  const kind = commandKind(command);
  if (kind) void captureFromBackground(kind, { tab });
});

// =====================================================================
// Auth callback — complete only a correlated, PKCE-bound login
// =====================================================================

registerOAuthMessages();

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab.url) return;

  try {
    const url = new URL(tab.url);
    const baseUrl = new URL(API_BASE_URL);

    if (url.origin === baseUrl.origin && url.pathname === AUTH_SUCCESS_PATH && url.hash) {
      const params = new URLSearchParams(url.hash.slice(1));
      if (params.has("code") || params.has("access_token") || params.has("refresh_token")) {
        void completeOAuthLogin(tabId, tab.url).catch(() => {});
        return;
      }

      // Provider-link (bind) round-trip: no tokens, just a result. Signal the open
      // new-tab (via storage.onChanged) to refresh its linked-accounts list, then
      // close the tab.
      const bound = params.get("bound");
      const bindError = params.get("bind_error");
      if (bound || bindError) {
        void chrome.storage.local.set({
          [BIND_RESULT_KEY]: { provider: bound || "google", error: bindError || null, at: Date.now() },
        }).then(() => chrome.tabs.remove(tabId));
      }
      return;
    }

    // Billing checkout return — unlike the auth callback above, the payment
    // provider appends real query params here (?status=berhasil&trx_id=...,
    // confirmed live against iPaymu), not a hash fragment.
    if (url.origin === baseUrl.origin && (url.pathname === BILLING_SUCCESS_PATH || url.pathname === BILLING_CANCEL_PATH)) {
      const outcome = url.pathname === BILLING_SUCCESS_PATH ? "success" : "cancel";
      void chrome.storage.local.set({
        [BILLING_RESULT_KEY]: { outcome, at: Date.now() },
      }).then(() => chrome.tabs.remove(tabId));
    }
  } catch (_) {
    // Invalid URL, ignore
  }
});

// =====================================================================
// Structured sync — push Yjs state to BE PostgreSQL tables
// =====================================================================

let syncTimer: ReturnType<typeof setTimeout> | null = null;

/** Canonical Yjs→JSON (same as newtab getSpaces / decodeSpacesFromStorage) — FE-B2. */
function extractSpaces(state: unknown): SavedSpace[] {
  return decodeSpacesFromStorage(state);
}

async function readLatestSpaces(): Promise<SavedSpace[]> {
  // A failed read is not an empty workspace; retain the retry flag on failure.
  const result = await chrome.storage.local.get(PERSIST_KEY);
  const state = result[PERSIST_KEY];
  if (state === undefined) throw new Error("Workspace has not been persisted");
  return extractSpaces(state);
}

// All triggers share one flight. A trailing pass always reads current storage;
// no timer/alarm is allowed to upload a captured, obsolete snapshot.
let pushInFlight: Promise<void> | null = null;
let pushAgain = false;

export function pushStructuredData(): Promise<void> {
  if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
  pushAgain = true;
  if (pushInFlight) return pushInFlight;
  pushInFlight = (async () => {
    try {
      do {
        pushAgain = false;
        await withSyncWriteLock(pushLatestStructuredData);
      } while (pushAgain);
    } catch (_) {
      // Keep the durable pending flag for the retry alarm on storage/API failure,
      // and say it failed: pages show "Sync error" from this flag.
      try { await chrome.storage.local.set({ [PUSH_FAILED_KEY]: true }); } catch (_) { /* ok */ }
    } finally {
      pushInFlight = null;
    }
  })();
  return pushInFlight;
}

async function pushLatestStructuredData() {
  if (!await automaticPushAllowed()) return;
  // Access taken away in the browser: the pending flag stays, and the
  // push runs again once access is back (permissions.onAdded below).
  if (!await hasApiAccess()) return;
  // The server refused this version: wait for the update, pending flag kept.
  if (await readUpdateRequired()) return;
  const tokens = await loadTokens();
  if (!tokens) return;
  // Hold pushes while a true OCC / merge conflict is unresolved (FE-B3).
  if (await isConflictPending()) return;
  // An OCC result must be rebased in a live page before its merge-base advances.
  // The receipt survives worker/page closure; do not upload stale disk over it.
  const pending = await chrome.storage.local.get(LANDED_SNAPSHOT_KEY);
  if (pending[LANDED_SNAPSHOT_KEY]) return;

  try { await chrome.storage.local.set({ [PENDING_PUSH_KEY]: true }); } catch (_) { /* ok */ }

  // Optimistic-concurrency push with 409 reconcile lives in structuredSync. On a
  // conflict we 3-way merge the server's returned state with our latest local one
  // against the sync merge-base, so a concurrent delete isn't resurrected. A true
  // conflict (edit-edit / delete-vs-edit) returns null → durable OCC payload is
  // stored for any newtab resolver; push retries stop until the user acts.
  // A confirmed push records its local ancestor as well as what landed.
  const result = await syncStructuredSnapshot(
    await readLatestSpaces(),
    readLatestSpaces,
    async (server, local) => {
      const stored = await getMergeBase();
      const base = stored ? canonicalSpaces(stored) : null;
      const srv = server as SavedSpace[];
      const loc = local as SavedSpace[];
      const { merged, conflicts } = merge3(base, srv, loc);
      if (conflicts.length > 0) {
        // Persist so a closed newtab still surfaces the conflict on next open.
        await saveOccConflictPayload({ base, server: srv, local: loc, conflicts }, true);
        return null;
      }
      return merged;
    },
    async (spaces, _revision, localAtAttempt) => {
      await clearConflictPending(); // successful land clears any stale OCC deferral
      await recordLandedSnapshot(spaces as SavedSpace[], localAtAttempt as SavedSpace[]);
    },
    // Plan-limit rejection: keep a notice the new-tab shows as "Sync paused"
    // until a push lands, since the background worker can't render UI.
    (message, detail) => saveLimitNotice(message, detail),
    automaticPushAllowed,
  );
  if (result === "ok") await clearLimitNotice();
  // Only a real failure is a sync error; a paused attempt says nothing new.
  try {
    if (result === "error") await chrome.storage.local.set({ [PUSH_FAILED_KEY]: true });
    else if (result !== "paused") await chrome.storage.local.remove(PUSH_FAILED_KEY);
  } catch (_) { /* ok */ }

  // "error" / "paused" → keep PENDING_PUSH for a later allowed retry.
  // "ok" / "limit" / "skipped" → clear it: skipped is handled by conflictPending
  // + OCC payload (retrying the same 409 loop would not help until resolve).
  if (result !== "error" && result !== "paused" && !pushAgain && await automaticPushAllowed()) {
    try { await chrome.storage.local.remove(PENDING_PUSH_KEY); } catch (_) { /* ok */ }
  }
}

// Periodic safety net for a push that failed with no further local edit to
// naturally retrigger it (the debounce listener below only fires on a *new*
// Yjs mutation). Chrome may suspend the service worker between ticks — alarms
// (unlike setInterval) survive that and still fire.
chrome.alarms.create(RETRY_ALARM, { periodInMinutes: 5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== RETRY_ALARM) return;
  void (async () => {
    try {
      const p = await chrome.storage.local.get(PENDING_PUSH_KEY);
      if (p[PENDING_PUSH_KEY] !== true) return;
    } catch (_) { return; }
    await pushStructuredData();
  })();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes[SETTINGS_KEY] && !storedAutoSync(changes[SETTINGS_KEY].newValue)) {
    if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
    pushAgain = false;
  }
  if (changes[LANDED_SNAPSHOT_KEY]?.oldValue && !changes[LANDED_SNAPSHOT_KEY]?.newValue) {
    void pushStructuredData();
  }
  // The plan may fit now (e.g. after an upgrade): retry the push that the limit
  // stopped, without waiting for the next edit.
  if (changes[LIMIT_RECHECK_KEY]?.newValue) {
    void chrome.storage.local.remove(LIMIT_RECHECK_KEY);
    void pushStructuredData();
  }
  // A page asked for an upload now: its resolution left the document
  // unchanged, so no persist below would trigger one.
  if (changes[PUSH_REQUEST_KEY]?.newValue) {
    void chrome.storage.local.remove(PUSH_REQUEST_KEY);
    void pushStructuredData();
  }
  if (!changes[PERSIST_KEY]) return;
  const newValue = changes[PERSIST_KEY].newValue;
  if (!readPersistedUpdate(newValue)) return;

  // Mark pending immediately so worker suspension during debounce cannot forget it.
  void chrome.storage.local.set({ [PENDING_PUSH_KEY]: true });
  if (pushInFlight) pushAgain = true;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => { syncTimer = null; void pushStructuredData(); }, SYNC_DEBOUNCE_MS);
});

// Install, update and browser-update each run their own steps.
chrome.runtime.onInstalled.addListener((details) => {
  void runInstallSteps(details.reason, {
    deviceId: getDeviceId,
    seed: seedFirstInstall,
    menus: registerCaptureMenus,
    restoreTabs: restoreTabsAfterUpdate,
    clearUpdateRequired,
    initialPush: doInitialPush,
  });
});
chrome.runtime.onStartup.addListener(doInitialPush);
chrome.permissions?.onAdded?.addListener(() => { void pushStructuredData(); });

// A new version is applied when no one is using FlexTab, after every write has
// finished (services/updateFlow.ts).
installUpdateRequired();
installUpdateFlow({
  flushBackground: async () => { await Promise.allSettled([pushInFlight ?? Promise.resolve(), waitForTokenRefresh()]); },
  reload: () => chrome.runtime.reload(),
});

async function doInitialPush() {
  await pushStructuredData();
}
