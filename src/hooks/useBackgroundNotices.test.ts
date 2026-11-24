import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { useBackgroundNotices } from "./useBackgroundNotices"
import { useAuthStore } from "~src/store/useAuthStore"
import { useSyncStore } from "~src/store/useSyncStore"

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }))
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: toastError, success: vi.fn() }) }))
vi.mock("~src/store/usePlanStore", () => ({ usePlanStore: { getState: () => ({ load: vi.fn(async () => {}) }) } }))

const notice = { message: "total tab limit reached (190/150) on the free plan", at: 1, limit: "max_tabs_total", cap: 150, got: 190 }
type Listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => void
const listener = (): Listener => vi.mocked(chrome.storage.onChanged.addListener).mock.calls.at(-1)![0] as unknown as Listener

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({ isAuthenticated: true })
  useSyncStore.setState({ limit: null, status: "online" })
})

describe("useBackgroundNotices: plan limit", () => {
  it("restores a stored limit as a lasting state without toasting again or deleting it", async () => {
    vi.mocked(chrome.storage.local.get).mockResolvedValueOnce({ flextab_limit_notice: notice } as never)
    renderHook(() => useBackgroundNotices())
    await waitFor(() => expect(useSyncStore.getState().limit).toEqual(notice))
    expect(toastError).not.toHaveBeenCalled()
    expect(chrome.storage.local.remove).not.toHaveBeenCalledWith("flextab_limit_notice")
  })

  it("toasts once when sync becomes paused and clears when a push lands", async () => {
    vi.mocked(chrome.storage.local.get).mockResolvedValueOnce({} as never)
    renderHook(() => useBackgroundNotices())
    await waitFor(() => expect(chrome.storage.onChanged.addListener).toHaveBeenCalled())
    listener()({ flextab_limit_notice: { newValue: notice } }, "local")
    expect(useSyncStore.getState().limit).toEqual(notice)
    expect(toastError).toHaveBeenCalledTimes(1)
    expect(toastError).toHaveBeenCalledWith("Sync paused", expect.objectContaining({
      description: "190 of 150 tabs. Remove 40 to sync again, or upgrade. Your tabs are still saved on this device.",
      action: expect.objectContaining({ label: "See plan" }),
    }))
    // Repeated rejections while paused stay quiet.
    listener()({ flextab_limit_notice: { newValue: { ...notice, at: 2 } } }, "local")
    expect(toastError).toHaveBeenCalledTimes(1)
    listener()({ flextab_limit_notice: { oldValue: notice } }, "local")
    expect(useSyncStore.getState().limit).toBeNull()
  })
})

describe("useBackgroundNotices: session expired", () => {
  it("toasts on the workspace, but not over the sign-in dialog that already says it", async () => {
    vi.mocked(chrome.storage.local.get).mockResolvedValueOnce({} as never)
    renderHook(() => useBackgroundNotices())
    await waitFor(() => expect(chrome.storage.onChanged.addListener).toHaveBeenCalled())
    window.history.replaceState(null, "", "#/signin")
    listener()({ flextab_session_expired: { newValue: true } }, "local")
    expect(toastError).not.toHaveBeenCalled()
    expect(chrome.storage.local.remove).not.toHaveBeenCalledWith("flextab_session_expired")
    window.history.replaceState(null, "", "#/")
    listener()({ flextab_session_expired: { newValue: true } }, "local")
    expect(toastError).toHaveBeenCalledWith("Your session expired", expect.anything())
  })
})
