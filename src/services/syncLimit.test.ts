import { describe, expect, it, vi } from "vitest"
import { limitSummary, parseLimitNotice } from "./syncLimit"

describe("syncLimit", () => {
  it("parses a stored notice and rejects anything else", () => {
    expect(parseLimitNotice({ message: "m", at: 5, limit: "max_tabs_total", cap: 150, got: 190 }))
      .toEqual({ message: "m", at: 5, limit: "max_tabs_total", cap: 150, got: 190 })
    expect(parseLimitNotice({ message: "m" })).toEqual({ message: "m", at: 0, limit: undefined, cap: undefined, got: undefined })
    expect(parseLimitNotice(undefined)).toBeNull()
    expect(parseLimitNotice({ at: 1 })).toBeNull()
  })

  it("says how many tabs to remove, following the device's own count", () => {
    const notice = { message: "m", at: 0, limit: "max_tabs_total", cap: 150, got: 190 }
    expect(limitSummary(notice)).toBe("190 of 150 tabs. Remove 40 to sync again, or upgrade.")
    expect(limitSummary(notice, 160)).toBe("160 of 150 tabs. Remove 10 to sync again, or upgrade.")
    expect(limitSummary(notice, 150)).toBe("Back within 150 tabs. Syncing again.")
  })

  it("falls back to the server's message as a sentence for other limits", () => {
    expect(limitSummary({ message: "sync size limit reached (9/8) on the free plan", at: 0, limit: "max_tree_bytes" }))
      .toBe("Sync size limit reached (9/8) on the free plan.")
    expect(limitSummary({ message: "Sync payload is too large. Reduce it to 8 MiB or less.", at: 0 }))
      .toBe("Sync payload is too large. Reduce it to 8 MiB or less.")
    expect(limitSummary({ message: " ", at: 0 })).toBe("Your plan's limit was reached.")
  })
})

describe("syncLimit storage", () => {
  it("survives a storage failure and uses the cap when the count is unknown", async () => {
    const { saveLimitNotice, clearLimitNotice, requestLimitRecheck } = await import("./syncLimit")
    vi.mocked(chrome.storage.local.set).mockRejectedValueOnce(new Error("quota")).mockRejectedValueOnce(new Error("quota"))
    vi.mocked(chrome.storage.local.remove).mockRejectedValueOnce(new Error("gone"))
    await expect(saveLimitNotice("m")).resolves.toBeUndefined()
    await expect(requestLimitRecheck()).resolves.toBeUndefined()
    await expect(clearLimitNotice()).resolves.toBeUndefined()
    expect(limitSummary({ message: "m", at: 0, limit: "max_tabs_total", cap: 150 })).toBe("Back within 150 tabs. Syncing again.")
  })
})
