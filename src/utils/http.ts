/**
 * The one way FlexTab talks to its server (TASK-114). Every service calls
 * `http()` instead of `fetch`, so whatever every request needs is added here,
 * once, and whatever every response can mean is caught here, once:
 *
 *   injection  X-Client-Version and X-Client-Channel on every request (and the
 *              same pair as query parameters for the live sync socket, which
 *              cannot carry headers), so the server knows who is calling;
 *   intercept  426 client_too_old: this version is below the server's minimum.
 *              It is recorded once here; the background asks the browser for
 *              an update and sync shows "Update needed" (services/updateRequired).
 *
 * Callers still read and judge their own responses: http() returns the
 * Response untouched.
 */

/** Where a too-old answer is recorded: { minVersion, at }. Read by the background and the pages. */
export const UPDATE_REQUIRED_KEY = "flextab_update_required"
export const CLIENT_TOO_OLD = "client_too_old"
/** The live sync socket's close code for the same answer (4000-4999 are the application's own). */
export const CLIENT_TOO_OLD_CLOSE_CODE = 4426

/** The manifest version: X.Y.Z for stable, X.Y.Z.N for beta. */
export function clientVersion(): string {
  try {
    return chrome.runtime.getManifest().version
  } catch (_) {
    return "0.0.0"
  }
}

/** stable or beta, set by scripts/build.mjs; dev for `plasmo dev`. */
export function clientChannel(): string {
  return process.env.PLASMO_PUBLIC_FLEXTAB_CHANNEL || "dev"
}

export function clientHeaders(): Record<string, string> {
  return { "X-Client-Version": clientVersion(), "X-Client-Channel": clientChannel() }
}

/** The same identity as query parameters, for the WebSocket URL. */
export function clientQuery(): string {
  return new URLSearchParams({ client_version: clientVersion(), client_channel: clientChannel() }).toString()
}

/** Records that the server refused this version. Safe to call from any context. */
export async function markClientTooOld(minVersion: string | undefined): Promise<void> {
  try {
    await chrome.storage.local.set({ [UPDATE_REQUIRED_KEY]: { minVersion: minVersion ?? null, at: Date.now() } })
  } catch (_) { /* no extension context */ }
}

/** The caller's headers plus the client's identity, kept as a plain object as callers pass them. */
function withClientHeaders(headers: HeadersInit | undefined): Record<string, string> {
  const own = headers instanceof Headers || Array.isArray(headers) ? Object.fromEntries(new Headers(headers)) : { ...(headers ?? {}) }
  return { ...own, ...clientHeaders() }
}

/** fetch, with the client's identity added and a too-old answer recorded. */
export async function http(url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, { ...init, headers: withClientHeaders(init.headers) })
  if (res.status === 426) {
    const body = await res.clone().json().catch(() => null) as { code?: unknown; min_version?: unknown } | null
    if (body?.code === CLIENT_TOO_OLD) await markClientTooOld(typeof body.min_version === "string" ? body.min_version : undefined)
  }
  return res
}
