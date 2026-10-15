import { v7 as uuidv7 } from "uuid";

const API_BASE_URL = process.env.PLASMO_PUBLIC_API_URL || "http://localhost:3000";

interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

let tokenData: TokenData | null = null;
let refreshPromise: Promise<TokenData | null> | null = null;

// Stable per-install device id, sent as X-Client-ID so the backend can keep a
// passive registry of devices that have used the account.
const DEVICE_ID_KEY = "flextab_device_id";
let deviceId: string | null = null;
let deviceIdPromise: Promise<string> | null = null;

export async function getDeviceId(): Promise<string> {
  if (deviceId) return deviceId;
  // Deduplicate concurrent first-run calls so a single install resolves to one
  // id (otherwise parallel requests each generate one → duplicate device rows).
  if (!deviceIdPromise) {
    deviceIdPromise = (async () => {
      try {
        const result = await chrome.storage.local.get(DEVICE_ID_KEY);
        if (typeof result[DEVICE_ID_KEY] === "string" && result[DEVICE_ID_KEY]) {
          deviceId = result[DEVICE_ID_KEY];
          return deviceId;
        }
      } catch (_) { /* no extension context */ }

      const id = uuidv7();
      try { await chrome.storage.local.set({ [DEVICE_ID_KEY]: id }); } catch (_) { /* ok */ }
      deviceId = id;
      return id;
    })().finally(() => { deviceIdPromise = null; });
  }
  return deviceIdPromise;
}

export async function loadTokens(): Promise<TokenData | null> {
  try {
    const result = await chrome.storage.local.get("auth_tokens");
    tokenData = result.auth_tokens ?? null;
  } catch (_) {
    tokenData = null;
  }
  return tokenData;
}

export async function saveTokens(tokens: TokenData): Promise<void> {
  tokenData = tokens;
  try { await chrome.storage.local.set({ auth_tokens: tokens }); } catch (_) { /* no extension context */ }
}

export async function clearTokens(): Promise<void> {
  tokenData = null;
  try { await chrome.storage.local.remove("auth_tokens"); } catch (_) { /* no extension context */ }
}

// When auth dies without the user asking for it (401 / failed refresh), leave a
// note so the onboarding screen can say "session expired" instead of silently
// dumping the user back to the sign-in page. Explicit logout does NOT set this.
export const SESSION_EXPIRED_KEY = "flextab_session_expired";

async function flagSessionExpired(): Promise<void> {
  try { await chrome.storage.local.set({ [SESSION_EXPIRED_KEY]: true }); } catch (_) { /* ok */ }
}

function isTokenExpired(): boolean {
  if (!tokenData) return true;
  // Refresh 60s before expiry
  return Date.now() / 1000 >= tokenData.expires_at - 60;
}

async function refreshTokens(): Promise<TokenData | null> {
  if (!tokenData?.refresh_token) return null;
  const attemptedRefreshToken = tokenData.refresh_token;

  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: attemptedRefreshToken }),
    });

    if (res.ok) {
      const newTokens: TokenData = await res.json();
      if (!newTokens || typeof newTokens.access_token !== "string" || !newTokens.access_token ||
          typeof newTokens.refresh_token !== "string" || !newTokens.refresh_token ||
          typeof newTokens.expires_at !== "number" || !Number.isFinite(newTokens.expires_at) ||
          newTokens.expires_at <= Date.now() / 1000) {
        throw new RefreshUnavailableError();
      }
      await saveTokens(newTokens);
      return newTokens;
    }

    if (res.status === 401) {
      // Refresh-token rotation revokes the previous token the instant any
      // context uses it. The background worker and a newtab/options page are
      // separate JS contexts that each hold their own copy of the same
      // refresh token, so both can legitimately fire this near the same
      // 15-minute boundary — the loser gets a 401 for a token that was valid
      // when it was sent, not actually expired. Before declaring the session
      // dead, check storage for a token a sibling context may have already
      // rotated in; adopt it instead of wiping a session that's still alive.
      // One short retry covers the tight window where the winner's write
      // hasn't landed in storage yet.
      for (const delayMs of [0, 250]) {
        if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
        // A storage read error cannot prove no sibling rotated the token.
        // Preserve the cached session and let the caller retry instead of logout.
        const stored = await chrome.storage.local.get("auth_tokens");
        const latest = stored.auth_tokens as TokenData | undefined;
        if (latest && latest.refresh_token !== attemptedRefreshToken &&
            latest.access_token && latest.expires_at > Date.now() / 1000) {
          tokenData = latest;
          return latest;
        }
      }
      await flagSessionExpired();
      await clearTokens();
      return null;
    }

    // Do not turn a refresh outage into an anonymous protected request. Only
    // an explicit 401 above expires the session; other failures are retryable.
    throw new RefreshUnavailableError();
  } catch (error) {
    if (error instanceof RefreshUnavailableError) throw error;
    throw new RefreshUnavailableError();
  }
}

async function getValidToken(): Promise<string | null> {
  if (!tokenData) {
    await loadTokens();
  }
  if (!tokenData) return null;

  if (!isTokenExpired()) {
    return tokenData.access_token;
  }

  // Deduplicate concurrent refresh calls
  if (!refreshPromise) {
    refreshPromise = refreshTokens().finally(() => {
      refreshPromise = null;
    });
  }

  const refreshed = await refreshPromise;
  if (!refreshed) throw new ApiError(401, "Session expired");
  return refreshed.access_token;
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await getValidToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Client-ID": await getDeviceId(),
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    // Token invalid — clear and let the UI handle re-auth
    await flagSessionExpired();
    await clearTokens();
    throw new ApiError(401, "Unauthorized");
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) ?? {};
    throw new ApiError(res.status, body.error || res.statusText);
  }

  return res.json();
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Refresh failed without proving the saved session invalid. */
export class RefreshUnavailableError extends ApiError {
  readonly retryable = true;
  constructor() {
    super(503, "Could not refresh your session. Please try again.");
    this.name = "RefreshUnavailableError";
  }
}

export function getAuthUrl(): string {
  return `${API_BASE_URL}/api/auth/google`;
}

/** OAuth sign-in URL for a provider (open in a tab). */
export function getOAuthUrl(provider: string): string {
  return `${API_BASE_URL}/api/auth/${provider}`;
}

/** The OAuth providers the server actually has configured — so the UI only
 *  offers sign-in/link options that work. Public (no auth). */
export async function apiGetAuthProviders(): Promise<string[]> {
  const res = await apiFetch<{ providers: string[] }>("/api/auth/providers");
  return res.providers ?? [];
}

export type SyncPushResult =
  | { status: "ok"; revision: number }
  | { status: "conflict"; revision: number; spaces: unknown[] }
  | { status: "limit"; message: string }
  | { status: "error" };

/**
 * Push the full structured snapshot with optimistic concurrency. The server
 * applies it only if base_revision matches its current revision; otherwise it
 * returns 409 with the up-to-date revision so the caller can reconcile + retry.
 */
export async function pushSync(spaces: unknown[], baseRevision: number | null): Promise<SyncPushResult> {
  let res: Response;
  try {
    const token = await getValidToken();
    if (!token) return { status: "error" };
    const body = JSON.stringify({ spaces, base_revision: baseRevision });
    // Match the API's transport ceiling (internal/plan.MaxSyncBodyBytes).
    // An early server rejection can reset an in-flight upload before fetch
    // receives the 413. Count UTF-8 bytes, including the JSON envelope.
    if (new TextEncoder().encode(body).byteLength > 8 * 1024 * 1024) {
      return { status: "limit", message: "Sync payload is too large. Reduce it to 8 MiB or less." };
    }
    res = await fetch(`${API_BASE_URL}/api/sync`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Client-ID": await getDeviceId(),
        "Authorization": `Bearer ${token}`,
      },
      body,
    });
  } catch (_) {
    return { status: "error" };
  }

  if (res.status === 409) {
    const body = (await res.json().catch(() => ({}))) ?? {};
    return {
      status: "conflict",
      revision: typeof body.revision === "number" ? body.revision : (baseRevision ?? 0),
      spaces: Array.isArray(body.spaces) ? body.spaces : [],
    };
  }
  if (res.status === 413) {
    // Transport/ingress limits are terminal for this payload, just like plan
    // limits. Proxies may return HTML instead of the API's structured JSON.
    const body = (await res.json().catch(() => ({}))) ?? {};
    return {
      status: "limit",
      message: typeof body.error === "string" && body.error.trim()
        ? body.error
        : "Sync payload is too large for the server. Reduce the workspace size and try again.",
    };
  }
  if (res.status === 403) {
    // Plan limit hit — the push can't land until the user prunes or upgrades.
    const body = (await res.json().catch(() => ({}))) ?? {};
    if (body.code === "plan_limit_exceeded") {
      return { status: "limit", message: typeof body.error === "string" ? body.error : "Plan limit reached" };
    }
    return { status: "error" };
  }
  if (!res.ok) return { status: "error" };

  const body = (await res.json().catch(() => ({}))) ?? {};
  return { status: "ok", revision: typeof body.revision === "number" ? body.revision : (baseRevision ?? 0) + 1 };
}

/** Fetch the server's current sync revision (lightweight — no data payload). */
export async function fetchSyncRevision(): Promise<number | null> {
  try {
    const data = await apiFetch<{ revision: number }>("/api/sync/revision");
    return typeof data.revision === "number" ? data.revision : null;
  } catch (_) {
    return null;
  }
}

export async function apiRegister(email: string, password: string, name: string): Promise<TokenData> {
  const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) ?? {};
    throw new ApiError(res.status, body.error || res.statusText);
  }
  return res.json();
}

export async function apiLogin(email: string, password: string): Promise<TokenData> {
  const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) ?? {};
    throw new ApiError(res.status, body.error || res.statusText);
  }
  return res.json();
}

/**
 * Best-effort server-side revocation of the refresh token on logout, so a
 * leaked copy stops working immediately instead of living out its 7 days.
 */
export async function apiLogout(): Promise<void> {
  const tokens = tokenData ?? (await loadTokens());
  if (!tokens?.refresh_token) return;
  try {
    await fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: tokens.refresh_token }),
    });
  } catch (_) { /* offline — the token still expires on its own */ }
}

export async function apiChangePassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiFetch("/api/auth/password", {
    method: "PUT",
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
}

export interface LinkedIdentity {
  provider: string;
  email: string;
  linked_at: string;
}

/** Update editable profile fields (currently just the display name). */
export async function apiUpdateProfile(name: string): Promise<void> {
  await apiFetch("/api/me", { method: "PATCH", body: JSON.stringify({ name }) });
}

/** List the account's linked sign-in providers + whether a password is set. */
export async function apiListIdentities(): Promise<{ identities: LinkedIdentity[]; has_password: boolean }> {
  return apiFetch<{ identities: LinkedIdentity[]; has_password: boolean }>("/api/me/identities");
}

/** Unlink a provider. Throws ApiError 409 (code "last_login_method") if it's the
 *  account's only remaining sign-in method. */
export async function apiUnbindIdentity(provider: string): Promise<void> {
  await apiFetch(`/api/me/identities/${provider}`, { method: "DELETE" });
}

/** Get the OAuth URL for LINKING a provider to the current account (open it in a
 *  tab; the callback links the identity and closes the tab). */
export async function apiGetBindUrl(provider: string): Promise<string> {
  const res = await apiFetch<{ url: string }>(`/api/auth/${provider}/bind`);
  return res.url;
}

export interface PlanLimits {
  max_tabs_total: number;
  max_tree_bytes: number;
  max_snapshots: number;
}

export interface PlanUsage {
  total_tabs: number;
  tree_bytes: number;
  snapshots: number;
}

export interface PlanStatus {
  plan: string;
  limits: PlanLimits;
  /** Plus/Pro-tier limits, so the UI can show what each upgrade buys. */
  plus_limits?: PlanLimits;
  pro_limits?: PlanLimits;
  usage: PlanUsage;
}

/** Fetch the account's plan, its limits, and current usage (for the Plan & Usage UI). */
export async function apiGetPlan(): Promise<PlanStatus> {
  return apiFetch<PlanStatus>("/api/plan");
}

/**
 * Get a checkout URL for upgrading to the given plan ("plus" or "pro",
 * defaults to "pro" for back-compat). Throws ApiError 503 when billing isn't
 * configured on the server and 409 when already subscribed.
 */
export async function apiGetCheckoutUrl(plan: "plus" | "pro" = "pro"): Promise<string> {
  const data = await apiFetch<{ url: string }>("/api/billing/checkout", {
    method: "POST",
    body: JSON.stringify({ plan }),
  });
  return data.url;
}

export interface BillingStatus {
  plan: string;
  active: boolean;
  status?: string;       // active, on_trial, cancelled, …
  provider?: string;     // "lemonsqueezy" | "ipaymu"
  card_brand?: string;
  card_last_four?: string;
  renews_at?: string | null;
  ends_at?: string | null;
  portal_url?: string;   // provider's customer portal (manage/cancel); empty for iPaymu
}

/** Subscription details for the Plan & Usage billing card. */
export async function apiGetBillingStatus(): Promise<BillingStatus> {
  return apiFetch<BillingStatus>("/api/billing/status");
}

export interface Transaction {
  id: string;
  provider: string;
  provider_id: string;
  plan: string;
  type: string; // created | updated | cancelled
  status: string;
  amount_idr: number; // 0 when the provider didn't report a reliable figure
  created_at: string;
}

/** The current user's own billing history, newest first (append-only ledger —
 * survives renewals, unlike BillingStatus which is just the current state). */
export async function apiGetTransactions(): Promise<Transaction[]> {
  const data = await apiFetch<{ transactions: Transaction[] }>("/api/billing/transactions");
  return data.transactions ?? [];
}

export async function apiGetSettings(): Promise<Record<string, unknown>> {
  return apiFetch<Record<string, unknown>>("/api/settings");
}

export async function apiPutSettings(settings: Record<string, unknown>): Promise<void> {
  await apiFetch("/api/settings", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
}

export { API_BASE_URL };
export type { TokenData };
