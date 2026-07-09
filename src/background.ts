import * as Y from "yjs";
import { loadTokens, getDeviceId } from "~src/services/api";
import { syncStructuredSnapshot } from "~src/services/structuredSync";
import { merge3 } from "~src/services/spacesMerge3";
import { getMergeBase, setMergeBase } from "~src/services/mergeBase";
import type { SavedSpace } from "~src/types";

const API_BASE_URL = process.env.PLASMO_PUBLIC_API_URL || "http://localhost:3000";
const AUTH_SUCCESS_PATH = "/auth/success";
const BILLING_SUCCESS_PATH = "/billing/success";
const BILLING_CANCEL_PATH = "/billing/cancel";
const PERSIST_KEY = "flextab_yjs_state";
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

function extractSpaces(state: number[]): unknown[] {
  const tempDoc = new Y.Doc();
  Y.applyUpdate(tempDoc, new Uint8Array(state));
  const arr = tempDoc.getArray<Y.Map<unknown>>("spaces");
  const spaces = arr.toArray().map(readYMap);
  tempDoc.destroy();
  return spaces;
}

function readYMap(m: Y.Map<unknown>): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  m.forEach((value, key) => {
    if (value instanceof Y.Array) {
      obj[key] = value.toArray().map((item) =>
        item instanceof Y.Map ? readYMap(item) : item,
      );
    } else {
      obj[key] = value;
    }
  });
  return obj;
}

async function readLatestSpaces(): Promise<unknown[]> {
  try {
    const result = await chrome.storage.local.get(PERSIST_KEY);
    const state = result[PERSIST_KEY];
    if (Array.isArray(state)) return extractSpaces(state);
  } catch (_) { /* ignore */ }
  return [];
}

async function pushStructuredData(state: number[]) {
  const tokens = await loadTokens();
  if (!tokens) return;
  // Don't push until the page has hydrated from the server this session — else
  // we could overwrite the server with pre-hydration (empty/guest) data.
  try {
    const f = await chrome.storage.local.get("flextab_sync_hydrated");
    if (f["flextab_sync_hydrated"] !== true) return;
  } catch (_) { return; }

  try { await chrome.storage.local.set({ [PENDING_PUSH_KEY]: true }); } catch (_) { /* ok */ }

  // Optimistic-concurrency push with 409 reconcile lives in structuredSync. On a
  // conflict we 3-way merge the server's returned state with our latest local one
  // against the sync merge-base, so a concurrent delete isn't resurrected. A true
  // conflict (edit-edit / delete-vs-edit) returns null → the push defers and the
  // open new-tab reconcile surfaces the resolver. A confirmed push advances the
  // merge-base to what actually landed.
  const result = await syncStructuredSnapshot(
    extractSpaces(state),
    readLatestSpaces,
    async (server, local) => {
      const base = await getMergeBase();
      const { merged, conflicts } = merge3(base, server as SavedSpace[], local as SavedSpace[]);
      return conflicts.length > 0 ? null : merged;
    },
    (spaces) => setMergeBase(spaces as SavedSpace[]),
    // Plan-limit rejection: stash a notice the open new-tab picks up and toasts,
    // since the background worker can't render UI itself.
    (message) => {
      try { void chrome.storage.local.set({ [LIMIT_NOTICE_KEY]: { message, at: Date.now() } }); } catch (_) { /* ok */ }
    },
  );

  // "error" (offline, transient 401/5xx, etc.) is the one outcome worth
  // retrying automatically — leave the pending flag set so the next alarm
  // tick retries it even if the user makes no further edits. "ok" landed;
  // "limit"/"skipped" are terminal until the user acts (prune, or resolve the
  // interactive conflict) — retrying blindly would just repeat the same
  // outcome (or re-spam the limit notice), so clear the flag for those too.
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
