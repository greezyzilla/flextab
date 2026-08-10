import { useEffect } from "react"
import { toast } from "sonner"
import { SESSION_EXPIRED_KEY } from "~src/services/api"
import { useSyncStore } from "~src/store/useSyncStore"

const LIMIT_NOTICE_KEY = "flextab_limit_notice"
const BILLING_RESULT_KEY = "flextab_billing_result"
const PUSH_PENDING_KEY = "flextab_push_pending"

const WATCHED_KEYS = [
  LIMIT_NOTICE_KEY,
  BILLING_RESULT_KEY,
  PUSH_PENDING_KEY,
  SESSION_EXPIRED_KEY,
] as const

function showLimitNotice(notice: unknown) {
  if (notice && typeof notice === "object" && "message" in notice) {
    toast.error(String((notice as { message: unknown }).message), {
      description: "Prune some tabs or open Settings › Plan & Usage.",
    })
    try { void chrome.storage.local.remove(LIMIT_NOTICE_KEY) } catch (_) { /* ok */ }
  }
}

function showBillingResult(result: unknown) {
  if (result && typeof result === "object" && "outcome" in result) {
    const outcome = (result as { outcome: unknown }).outcome
    if (outcome === "success") {
      toast.success("Payment received", { description: "Confirming your plan…" })
    } else if (outcome === "cancel") {
      toast("Checkout cancelled")
    }
    try { void chrome.storage.local.remove(BILLING_RESULT_KEY) } catch (_) { /* ok */ }
  }
}

// Reflect background push-failure as Sync error; clear only reverts from
// "error" specifically so offline/paused is not clobbered.
function applyPushPending(pending: unknown) {
  if (pending === true) {
    useSyncStore.getState().setStatus("error")
  } else if (useSyncStore.getState().status === "error") {
    useSyncStore.getState().setStatus("online")
  }
}

// Session expired while user still has saved tabs (onboarding wall skipped) —
// toast instead of the onboarding inline banner.
function showSessionExpired(expired: unknown) {
  if (expired !== true) return
  toast.error("Your session expired", {
    description: "Sign in again to keep syncing — your tabs are still saved on this device.",
  })
  try { void chrome.storage.local.remove(SESSION_EXPIRED_KEY) } catch (_) { /* ok */ }
}

function applyKey(key: string, value: unknown) {
  switch (key) {
    case LIMIT_NOTICE_KEY:
      showLimitNotice(value)
      break
    case BILLING_RESULT_KEY:
      showBillingResult(value)
      break
    case PUSH_PENDING_KEY:
      applyPushPending(value)
      break
    case SESSION_EXPIRED_KEY:
      showSessionExpired(value)
      break
  }
}

/**
 * Surface background-worker notices that cannot render UI themselves.
 * Single multiplexed chrome.storage listener for limit, billing, push-pending,
 * and session-expired keys (read once on mount + onChanged).
 */
export function useBackgroundNotices() {
  useEffect(() => {
    try {
      void chrome.storage.local.get([...WATCHED_KEYS]).then((r) => {
        // Always apply each key (missing → undefined) so push_pending clear
        // semantics match the previous per-key bridges.
        for (const key of WATCHED_KEYS) {
          applyKey(key, r[key])
        }
      })
    } catch (_) { /* no extension context */ }

    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== "local") return
      for (const key of WATCHED_KEYS) {
        if (key in changes) {
          // push_pending: apply even when cleared (newValue undefined)
          applyKey(key, changes[key].newValue)
        }
      }
    }
    try { chrome.storage.onChanged.addListener(listener) } catch (_) { /* ok */ }
    return () => {
      try { chrome.storage.onChanged.removeListener(listener) } catch (_) { /* ok */ }
    }
  }, [])
}
