// Plan-limit state for sync (TASK-9). A rejected push leaves the server behind
// the device until the user removes tabs or upgrades, so the rejection is kept
// in storage (the background worker can't render UI) and shown as a lasting
// "Sync paused" state, not a one-off toast. Cleared when a push lands.

export const LIMIT_NOTICE_KEY = "flextab_limit_notice"
/** Set by a new-tab page when the plan now fits (e.g. after an upgrade); the
 *  background worker retries its push and removes it. */
export const LIMIT_RECHECK_KEY = "flextab_limit_recheck"

/** What the server reported: `limit` is its machine key (e.g. "max_tabs_total"). */
export interface SyncLimitDetail {
  limit?: string
  cap?: number
  got?: number
}

export interface SyncLimitNotice extends SyncLimitDetail {
  message: string
  at: number
}

export function parseLimitNotice(value: unknown): SyncLimitNotice | null {
  if (!value || typeof value !== "object") return null
  const v = value as Record<string, unknown>
  if (typeof v.message !== "string") return null
  return {
    message: v.message,
    at: typeof v.at === "number" ? v.at : 0,
    limit: typeof v.limit === "string" ? v.limit : undefined,
    cap: typeof v.cap === "number" ? v.cap : undefined,
    got: typeof v.got === "number" ? v.got : undefined,
  }
}

export async function saveLimitNotice(message: string, detail: SyncLimitDetail = {}): Promise<void> {
  const notice: SyncLimitNotice = { message, at: Date.now(), ...detail }
  try { await chrome.storage.local.set({ [LIMIT_NOTICE_KEY]: notice }) } catch (_) { /* ok */ }
}

export async function clearLimitNotice(): Promise<void> {
  try { await chrome.storage.local.remove(LIMIT_NOTICE_KEY) } catch (_) { /* ok */ }
}

export async function requestLimitRecheck(): Promise<void> {
  try { await chrome.storage.local.set({ [LIMIT_RECHECK_KEY]: Date.now() }) } catch (_) { /* ok */ }
}

function sentence(text: string): string {
  const t = text.trim()
  if (!t) return "Your plan's limit was reached."
  const s = t[0].toUpperCase() + t.slice(1)
  return /[.!?]$/.test(s) ? s : s + "."
}

/**
 * What the user can do about it, in one line. With the device's current tab
 * count the line follows the user's own pruning instead of the old rejection.
 */
export function limitSummary(notice: SyncLimitNotice, tabs?: number): string {
  if (notice.limit === "max_tabs_total" && notice.cap !== undefined) {
    const count = tabs ?? notice.got ?? notice.cap
    const over = count - notice.cap
    return over > 0
      ? `${count} of ${notice.cap} tabs. Remove ${over} to sync again, or upgrade.`
      : `Back within ${notice.cap} tabs. Syncing again.`
  }
  return sentence(notice.message)
}
