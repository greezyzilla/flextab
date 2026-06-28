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

function isTokenExpired(): boolean {
  if (!tokenData) return true;
  // Refresh 60s before expiry
  return Date.now() / 1000 >= tokenData.expires_at - 60;
}

async function refreshTokens(): Promise<TokenData | null> {
  if (!tokenData?.refresh_token) return null;

  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: tokenData.refresh_token }),
    });

    if (!res.ok) {
      await clearTokens();
      return null;
    }

    const newTokens: TokenData = await res.json();
    await saveTokens(newTokens);
    return newTokens;
  } catch (_) {
    return null;
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
  return refreshed?.access_token ?? null;
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

export function getAuthUrl(): string {
  return `${API_BASE_URL}/api/auth/google`;
}

export type SyncPushResult =
  | { status: "ok"; revision: number }
  | { status: "conflict"; revision: number; spaces: unknown[] }
  | { status: "error" };

/**
 * Push the full structured snapshot with optimistic concurrency. The server
 * applies it only if base_revision matches its current revision; otherwise it
 * returns 409 with the up-to-date revision so the caller can reconcile + retry.
 */
export async function pushSync(spaces: unknown[], baseRevision: number | null): Promise<SyncPushResult> {
  const token = await getValidToken();
  if (!token) return { status: "error" };

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api/sync`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Client-ID": await getDeviceId(),
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ spaces, base_revision: baseRevision }),
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

export async function apiChangePassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiFetch("/api/auth/password", {
    method: "PUT",
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
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
