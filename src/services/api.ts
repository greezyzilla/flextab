const API_BASE_URL = process.env.PLASMO_PUBLIC_API_URL || "http://localhost:3000";

interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

let tokenData: TokenData | null = null;
let refreshPromise: Promise<TokenData | null> | null = null;

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
    const body = await res.json().catch(() => ({}));
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

export { API_BASE_URL };
export type { TokenData };
