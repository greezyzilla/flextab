import { useEffect } from "react"
import { toast } from "sonner"
import { SESSION_EXPIRED_KEY } from "~src/services/api"
import { SIGN_IN_ROUTE } from "~src/lib/workspaceAccess"
import { useAuthStore } from "~src/store/useAuthStore"
import { useSyncStore } from "~src/store/useSyncStore"
import { usePlanStore } from "~src/store/usePlanStore"
import { LIMIT_NOTICE_KEY, limitSummary, parseLimitNotice } from "~src/services/syncLimit"
import { navigate } from "~src/lib/route"
const BILLING_RESULT_KEY = "flextab_billing_result"
const PUSH_PENDING_KEY = "flextab_push_pending"

const WATCHED_KEYS = [
  LIMIT_NOTICE_KEY,
  BILLING_RESULT_KEY,
  PUSH_PENDING_KEY,
  SESSION_EXPIRED_KEY,
] as const

// The limit is a lasting state (the header shows "Sync paused" until a push
// lands, TASK-9). Only the moment sync becomes paused also gets a toast.
function applyLimitNotice(value: unknown, announce: boolean) {
  const notice = parseLimitNotice(value)
  const wasPaused = useSyncStore.getState().limit !== null
  useSyncStore.getState().setLimit(notice)
  if (!notice || !useAuthStore.getState().isAuthenticated) return
  void usePlanStore.getState().load()
  if (announce && !wasPaused) {
    toast.error("Sync paused", {
      description: `${limitSummary(notice, undefined, usePlanStore.getState().status?.usage?.total_tabs === 0)} Your tabs are still saved on this device.`,
      action: { label: "See plan", onClick: () => navigate("/settings/plan") },
    })
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
// Guest / signed-out: never touch connection status (offline ≠ local-only).
function applyPushPending(pending: unknown) {
  if (!useAuthStore.getState().isAuthenticated) return
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
  // The sign-in dialog opens over the workspace (TASK-79) and says the same in
  // its own note, which also clears the flag: no toast on top of it.
  if (location.hash.replace(/^#/, "") === SIGN_IN_ROUTE) return
  toast.error("Your session expired", {
    description: "Sign in again to keep syncing. Your tabs are still saved on this device.",
  })
  try { void chrome.storage.local.remove(SESSION_EXPIRED_KEY) } catch (_) { /* ok */ }
}

function applyKey(key: string, value: unknown, announce = false) {
  switch (key) {
    case LIMIT_NOTICE_KEY:
      applyLimitNotice(value, announce)
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
          applyKey(key, changes[key].newValue, true)
        }
      }
    }
    try { chrome.storage.onChanged.addListener(listener) } catch (_) { /* ok */ }
    return () => {
      try { chrome.storage.onChanged.removeListener(listener) } catch (_) { /* ok */ }
    }
  }, [])
}
