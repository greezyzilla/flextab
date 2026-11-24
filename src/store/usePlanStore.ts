import { create } from "zustand"
import { apiGetPlan, type PlanStatus } from "~src/services/api"
import { requestLimitRecheck } from "~src/services/syncLimit"
import { useSyncStore } from "~src/store/useSyncStore"

interface PlanState {
  /** The signed-in account's plan, limits and server-side usage; null until loaded. */
  status: PlanStatus | null
  /** Fetch it again (deduplicated). Failures keep the last value. */
  load: () => Promise<void>
  clear: () => void
}

let inFlight: Promise<void> | null = null

/**
 * The plan's tab cap, so the workspace can show usage in context and warn
 * before a bulk save crosses it. Settings › Plan still loads its own
 * copy for the full breakdown.
 */
export const usePlanStore = create<PlanState>((set) => ({
  status: null,
  load: () => {
    if (inFlight) return inFlight
    inFlight = apiGetPlan()
      .then((status) => {
        set({ status })
        // Sync was paused at a smaller cap than the plan has now (an upgrade):
        // ask the background to retry instead of waiting for the next edit.
        const limit = useSyncStore.getState().limit
        const cap = tabCap(status)
        if (cap !== undefined && limit?.limit === "max_tabs_total" && (cap === 0 || (limit.cap !== undefined && cap > limit.cap))) {
          void requestLimitRecheck()
        }
      })
      .catch(() => { /* keep the last value */ })
      .finally(() => { inFlight = null })
    return inFlight
  },
  clear: () => set({ status: null }),
}))

/** Tab cap of the loaded plan: undefined while unknown, 0 for unlimited. */
export function tabCap(status: PlanStatus | null): number | undefined {
  const cap = status?.limits?.max_tabs_total
  return typeof cap === "number" ? cap : undefined
}

/** The share of the cap at which usage starts showing in the header. */
export const NEAR_CAP = 0.8
