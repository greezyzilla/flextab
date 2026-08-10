import { loadTokens, getDeviceId } from "~src/services/api";
import { syncStructuredSnapshot } from "~src/services/structuredSync";
import { merge3 } from "~src/services/spacesMerge3";
import { getMergeBase, setMergeBase } from "~src/services/mergeBase";
import { isConflictPending, saveOccConflictPayload, clearConflictPending } from "~src/services/conflictState";
import {
  PERSIST_KEY,
  decodeSpacesFromStorage,
  lightSpacesSig,
  persistSpacesSnapshot,
} from "~src/lib/yjsDoc";
import type { SavedSpace } from "~src/types";

const API_BASE_URL = process.env.PLASMO_PUBLIC_API_URL || "http://localhost:3000";
const AUTH_SUCCESS_PATH = "/auth/success";
const BILLING_SUCCESS_PATH = "/billing/success";
const BILLING_CANCEL_PATH = "/billing/cancel";
const LIMIT_NOTICE_KEY = "flextab_limit_notice";
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
// and on every worker start, so new-tab pages read it instead of racing to
// generate one (which could register duplicate devices on a fresh install).
chrome.runtime.onInstalled.addListener(() => { void getDeviceId(); });
void getDeviceId();

// =====================================================================
// Auth callback — capture tokens from the auth success page
// =====================================================================

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab.url) return;

  try {
    const url = new URL(tab.url);
    const baseUrl = new URL(API_BASE_URL);

    if (url.origin === baseUrl.origin && url.pathname === AUTH_SUCCESS_PATH && url.hash) {
      const params = new URLSearchParams(url.hash.slice(1));
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      const expiresAt = params.get("expires_at");

      if (accessToken && refreshToken && expiresAt) {
        const tokens = {
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_at: Number(expiresAt),
        };

        chrome.storage.local.set({ auth_tokens: tokens }).then(() => {
          chrome.tabs.remove(tabId);
        });
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
function extractSpaces(state: number[]): SavedSpace[] {
  return decodeSpacesFromStorage(state);
}

async function readLatestSpaces(): Promise<SavedSpace[]> {
  try {
    const result = await chrome.storage.local.get(PERSIST_KEY);
    const state = result[PERSIST_KEY];
    if (Array.isArray(state)) return extractSpaces(state);
  } catch (_) { /* ignore */ }
  return [];
}

/**
 * After a confirmed push, durable local state must match what landed on the server.
 * OCC merge can produce a tree that was never written to flextab_yjs_state — without
 * writeback, merge-base advances while local stays stale and the next 3-way can drop
 * peer-only tabs. Open newtabs apply the storage change via installExternalPersistBridge.
 */
async function onStructuredPushLanded(spaces: unknown[]): Promise<void> {
  const landed = spaces as SavedSpace[];
  try {
    const disk = await readLatestSpaces();
    if (lightSpacesSig(disk) !== lightSpacesSig(landed)) {
      // Suppress the storage.onChanged → push re-entry for our own writeback.
      ignorePersistPush = true;
      try {
        await persistSpacesSnapshot(landed);
      } finally {
        ignorePersistPush = false;
      }
    }
  } catch (_) { /* storage unavailable — still advance merge-base below */ }
  await setMergeBase(landed);
}

/** Skip push debounce when we ourselves wrote PERSIST_KEY after OCC land. */
let ignorePersistPush = false;

async function pushStructuredData(state: number[]) {
  const tokens = await loadTokens();
  if (!tokens) return;
  // Don't push until the page has hydrated from the server this session — else
  // we could overwrite the server with pre-hydration (empty/guest) data.
  try {
    const f = await chrome.storage.local.get("flextab_sync_hydrated");
    if (f["flextab_sync_hydrated"] !== true) return;
  } catch (_) { return; }

  // Hold pushes while a true OCC / merge conflict is unresolved (FE-B3).
  if (await isConflictPending()) return;

  try { await chrome.storage.local.set({ [PENDING_PUSH_KEY]: true }); } catch (_) { /* ok */ }

  // Optimistic-concurrency push with 409 reconcile lives in structuredSync. On a
  // conflict we 3-way merge the server's returned state with our latest local one
  // against the sync merge-base, so a concurrent delete isn't resurrected. A true
  // conflict (edit-edit / delete-vs-edit) returns null → durable OCC payload is
  // stored for any newtab resolver; push retries stop until the user acts.
  // A confirmed push writebacks the landed tree and advances the merge-base.
  const result = await syncStructuredSnapshot(
    extractSpaces(state),
    readLatestSpaces,
    async (server, local) => {
      const base = await getMergeBase();
      const srv = server as SavedSpace[];
      const loc = local as SavedSpace[];
      const { merged, conflicts } = merge3(base, srv, loc);
      if (conflicts.length > 0) {
        // Persist so a closed newtab still surfaces the conflict on next open.
        await saveOccConflictPayload({ base, server: srv, local: loc, conflicts });
        return null;
      }
      return merged;
    },
    async (spaces) => {
      await clearConflictPending(); // successful land clears any stale OCC deferral
      await onStructuredPushLanded(spaces);
    },
    // Plan-limit rejection: stash a notice the open new-tab picks up and toasts,
    // since the background worker can't render UI itself.
    (message) => {
      try { void chrome.storage.local.set({ [LIMIT_NOTICE_KEY]: { message, at: Date.now() } }); } catch (_) { /* ok */ }
    },
  );

  // "error" → keep PENDING_PUSH for the retry alarm.
  // "ok" / "limit" / "skipped" → clear it: skipped is handled by conflictPending
  // + OCC payload (retrying the same 409 loop would not help until resolve).
  if (result !== "error") {
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
    const result = await chrome.storage.local.get(PERSIST_KEY);
    const state = result[PERSIST_KEY];
    if (state && Array.isArray(state)) await pushStructuredData(state);
  })();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes[PERSIST_KEY]) return;
  if (ignorePersistPush) return;
  const newValue = changes[PERSIST_KEY].newValue;
  if (!newValue || !Array.isArray(newValue)) return;

  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => pushStructuredData(newValue), SYNC_DEBOUNCE_MS);
});

chrome.runtime.onInstalled.addListener(doInitialPush);
chrome.runtime.onStartup.addListener(doInitialPush);

async function doInitialPush() {
  try {
    const result = await chrome.storage.local.get(PERSIST_KEY);
    const state = result[PERSIST_KEY];
    if (state && Array.isArray(state)) {
      await pushStructuredData(state);
    }
  } catch (_) {
    // Offline or no auth
  }
}
