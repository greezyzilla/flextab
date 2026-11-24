import { beforeEach, describe, expect, it, vi } from "vitest"
import { usePlanStore, tabCap } from "./usePlanStore"
import { useSyncStore } from "./useSyncStore"
import type { PlanStatus } from "~src/services/api"

vi.mock("~src/services/api", () => ({ apiGetPlan: vi.fn() }))
import { apiGetPlan } from "~src/services/api"

const plan = (cap: number) => ({ plan: "free", limits: { max_tabs_total: cap, max_tree_bytes: 0, max_snapshots: 0 }, usage: { total_tabs: 0, tree_bytes: 0, snapshots: 0 } }) as PlanStatus

beforeEach(() => {
  vi.clearAllMocks()
  usePlanStore.setState({ status: null })
  useSyncStore.setState({ limit: null })
})

describe("usePlanStore", () => {
  it("loads the plan once at a time and keeps it on failure", async () => {
    vi.mocked(apiGetPlan).mockResolvedValueOnce(plan(150))
    await Promise.all([usePlanStore.getState().load(), usePlanStore.getState().load()])
    expect(apiGetPlan).toHaveBeenCalledTimes(1)
    expect(tabCap(usePlanStore.getState().status)).toBe(150)
    vi.mocked(apiGetPlan).mockRejectedValueOnce(new Error("offline"))
    await usePlanStore.getState().load()
    expect(tabCap(usePlanStore.getState().status)).toBe(150)
    usePlanStore.getState().clear()
    expect(tabCap(usePlanStore.getState().status)).toBeUndefined()
  })

  it("asks the background to retry when the cap grew past the one that paused sync", async () => {
    useSyncStore.setState({ limit: { message: "m", at: 0, limit: "max_tabs_total", cap: 150, got: 190 } })
    vi.mocked(apiGetPlan).mockResolvedValueOnce(plan(150))
    await usePlanStore.getState().load()
    expect(chrome.storage.local.set).not.toHaveBeenCalledWith(expect.objectContaining({ flextab_limit_recheck: expect.any(Number) }))
    vi.mocked(apiGetPlan).mockResolvedValueOnce(plan(2000))
    await usePlanStore.getState().load()
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ flextab_limit_recheck: expect.any(Number) })
  })
})

describe("tabCap", () => {
  it("is undefined for a missing or malformed plan", () => {
    expect(tabCap(null)).toBeUndefined()
    expect(tabCap({} as PlanStatus)).toBeUndefined()
    expect(tabCap({ limits: { max_tabs_total: 0 } } as PlanStatus)).toBe(0)
  })
})
