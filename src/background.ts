import * as Y from "yjs";
import { loadTokens, getDeviceId } from "~src/services/api";
import { syncStructuredSnapshot } from "~src/services/structuredSync";

const API_BASE_URL = process.env.PLASMO_PUBLIC_API_URL || "http://localhost:3000";
const AUTH_SUCCESS_PATH = "/auth/success";
const PERSIST_KEY = "flextab_yjs_state";
const SYNC_DEBOUNCE_MS = 5000;

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
      }
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
  // Optimistic-concurrency push with 409 reconcile lives in structuredSync; we
  // pass a re-derive callback so a conflict re-reads the latest merged Yjs state.
  await syncStructuredSnapshot(extractSpaces(state), readLatestSpaces);
}

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
