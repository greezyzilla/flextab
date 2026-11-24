import { describe, expect, it, vi } from "vitest"
import { clearKeptOnSignOut, KEPT_ON_SIGNOUT_KEY, loadKeptOnSignOut, markKeptOnSignOut } from "./keptWorkspace"

describe("keptWorkspace marker", () => {
  it("round-trips through storage", async () => {
    vi.mocked(chrome.storage.local.get).mockResolvedValueOnce({ [KEPT_ON_SIGNOUT_KEY]: true } as any)
    expect(await loadKeptOnSignOut()).toBe(true)
    await markKeptOnSignOut()
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ [KEPT_ON_SIGNOUT_KEY]: true })
    await clearKeptOnSignOut()
    expect(chrome.storage.local.remove).toHaveBeenCalledWith(KEPT_ON_SIGNOUT_KEY)
  })

  it("never throws when storage is unavailable, and reads as not kept", async () => {
    vi.mocked(chrome.storage.local.get).mockRejectedValueOnce(new Error("no ctx"))
    vi.mocked(chrome.storage.local.set).mockRejectedValueOnce(new Error("no ctx"))
    vi.mocked(chrome.storage.local.remove).mockRejectedValueOnce(new Error("no ctx"))
    expect(await loadKeptOnSignOut()).toBe(false)
    await expect(markKeptOnSignOut()).resolves.toBeUndefined()
    await expect(clearKeptOnSignOut()).resolves.toBeUndefined()
  })
})
