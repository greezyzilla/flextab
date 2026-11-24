import { withSyncWriteLock } from "./syncPolicy";
import { http } from "~src/utils/http";

const API_BASE_URL = process.env.PLASMO_PUBLIC_API_URL || "http://localhost:3000";
export const OAUTH_PENDING_KEY = "flextab_oauth_pending";
export const OAUTH_START = "flextab.oauth.start";
export const OAUTH_CALLBACK = "flextab.oauth.callback";
const ATTEMPT_TTL = 10 * 60 * 1000;
const secretPattern = /^[A-Za-z0-9_-]{43}$/;

/** The OAuth providers the extension can start a sign-in with; the server says which are configured. */
export const OAUTH_PROVIDERS = ["google", "github", "gitlab", "discord"] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

type PendingLogin = {
  provider: OAuthProvider;
  verifier: string;
  nonce: string;
  tabId: number;
  expiresAt: number;
};

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function pendingLogin(): Promise<PendingLogin | undefined> {
  const result = await chrome.storage.session.get(OAUTH_PENDING_KEY);
  return result[OAUTH_PENDING_KEY];
}

// Worker-local queue also serializes events if Web Locks is unavailable.
let oauthQueue: Promise<unknown> = Promise.resolve();
function withOAuthLock<T>(work: () => Promise<T>): Promise<T> {
  const run = oauthQueue.then(() => withSyncWriteLock(work));
  oauthQueue = run.catch(() => {});
  return run;
}

// Only the worker owns attempts. session storage survives worker suspension,
// clears on browser restart, and is not exposed to content scripts by default.
export async function startOAuthLogin(provider: unknown): Promise<void> {
  if (!OAUTH_PROVIDERS.includes(provider as OAuthProvider)) throw new Error("Unsupported sign-in provider");
  const chosen = provider as OAuthProvider;
  await withOAuthLock(async () => {
    if ((await chrome.storage.local.get("auth_tokens")).auth_tokens) throw new Error("Sign out before starting another sign-in");
    const previous = await pendingLogin();
    await chrome.storage.session.remove(OAUTH_PENDING_KEY);
    if (previous) void chrome.tabs.remove(previous.tabId).catch(() => {});
    const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
    const nonce = base64url(crypto.getRandomValues(new Uint8Array(32)));
    const challenge = base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
    const url = new URL(`${API_BASE_URL}/api/auth/${chosen}`);
    url.searchParams.set("state", nonce);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    const tab = await chrome.tabs.create({ url: "about:blank" });
    if (typeof tab.id !== "number") throw new Error("Could not open sign-in tab");
    try {
      await chrome.storage.session.set({ [OAUTH_PENDING_KEY]: { provider: chosen, verifier, nonce, tabId: tab.id, expiresAt: Date.now() + ATTEMPT_TTL } satisfies PendingLogin });
      await chrome.tabs.update(tab.id, { url: url.toString() });
    } catch (error) {
      await chrome.storage.session.remove(OAUTH_PENDING_KEY);
      void chrome.tabs.remove(tab.id).catch(() => {});
      throw error;
    }
  });
}

// Used by an explicit sign-out while holding the shared auth/sync write lock.
export async function cancelPendingOAuth(): Promise<void> {
  await chrome.storage.session.remove(OAUTH_PENDING_KEY);
}

export async function cancelOAuthTab(tabId: number): Promise<void> {
  await withOAuthLock(async () => {
    if ((await pendingLogin())?.tabId === tabId) await cancelPendingOAuth();
  });
}

export async function completeOAuthLogin(tabId: number, callbackURL: string): Promise<boolean> {
  const url = new URL(callbackURL);
  if (url.origin !== new URL(API_BASE_URL).origin || url.pathname !== "/auth/success") return false;
  const params = new URLSearchParams(url.hash.slice(1));
  const code = params.get("code"), nonce = params.get("state");
  // Never accept bearer tokens, even mixed with a legitimate code callback.
  if (params.has("access_token") || params.has("refresh_token") || params.getAll("code").length !== 1 || params.getAll("state").length !== 1 ||
      !code || !nonce || !secretPattern.test(code) || !secretPattern.test(nonce)) return false;
  return withOAuthLock(async () => {
    const pending = await pendingLogin();
    if (!pending || pending.tabId !== tabId || pending.nonce !== nonce) return false;
    if (!Number.isFinite(pending.expiresAt) || Date.now() >= pending.expiresAt || !secretPattern.test(pending.verifier)) {
      await cancelPendingOAuth();
      return false;
    }
    if ((await chrome.tabs.get(tabId)).url !== callbackURL) return false;
    if ((await chrome.storage.local.get("auth_tokens")).auth_tokens) {
      await cancelPendingOAuth();
      return false;
    }
    // Consume locally before the exchange. A lost response/worker interruption
    // requires a new login, never a replay of this attempt or a token URL fallback.
    await cancelPendingOAuth();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await http(`${API_BASE_URL}/api/auth/oauth/exchange`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "omit",
        body: JSON.stringify({ code, state: nonce, code_verifier: pending.verifier }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Sign-in could not finish. Start sign-in again.");
      const tokens = await response.json();
      if (!tokens || typeof tokens.access_token !== "string" || !tokens.access_token ||
          typeof tokens.refresh_token !== "string" || !tokens.refresh_token ||
          !Number.isFinite(tokens.expires_at) || tokens.expires_at <= Date.now() / 1000) throw new Error("Invalid sign-in response");
      // The tab may have been closed/navigated while the network was pending.
      if ((await chrome.tabs.get(tabId)).url !== callbackURL ||
          (await chrome.storage.local.get("auth_tokens")).auth_tokens) return false;
      // Reset hydration before tokens become visible to startup/background sync.
      await chrome.storage.local.remove("flextab_sync_hydrated");
      await chrome.storage.local.set({ auth_tokens: tokens, flextab_fresh_login: true });
      void chrome.tabs.remove(tabId).catch(() => {});
      return true;
    } finally { clearTimeout(timer); }
  });
}

export function registerOAuthMessages(): void {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== OAUTH_START && message?.type !== OAUTH_CALLBACK) return;
    if (sender.id !== chrome.runtime.id) return;
    let run: Promise<unknown>;
    if (message.type === OAUTH_START) {
      // A webpage content script cannot start a login, even from our API host.
      // The new tab page keeps its route in the fragment (#/signin), so the
      // page is compared without it.
      if (![chrome.runtime.getURL("newtab.html"), chrome.runtime.getURL("popup.html")].includes((sender.url ?? "").split("#")[0])) return;
      run = startOAuthLogin(message.provider);
    } else {
      if (sender.frameId !== 0 || typeof sender.tab?.id !== "number" || !sender.url) return;
      run = completeOAuthLogin(sender.tab.id, sender.url);
    }
    void run.then(result => sendResponse({ ok: result !== false }), () => sendResponse({ ok: false, error: "Sign-in could not finish. Start sign-in again." }));
    return true;
  });
  chrome.tabs.onRemoved.addListener(tabId => { void cancelOAuthTab(tabId).catch(() => {}); });
}
