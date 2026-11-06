import { beforeEach, describe, expect, it, vi } from "vitest"
import { openInCurrentWindow, openOrFocus } from "./openTab"

beforeEach(() => vi.clearAllMocks())

describe("openOrFocus", () => {
  it("focuses an open tab with the same URL and its window", async () => {
    vi.mocked(chrome.tabs.query).mockResolvedValue([
      { id: 3, windowId: 9, url: "https://Example.com/a/" } as chrome.tabs.Tab,
    ])
    expect(await openOrFocus("https://example.com/a")).toBe("focused")
    expect(chrome.tabs.update).toHaveBeenCalledWith(3, { active: true })
    expect(chrome.windows.update).toHaveBeenCalledWith(9, { focused: true })
    expect(chrome.tabs.create).not.toHaveBeenCalled()
  })

  it("opens a new tab when the URL is not open", async () => {
    vi.mocked(chrome.tabs.query).mockResolvedValue([{ id: 3, windowId: 9, url: "https://other.com" } as chrome.tabs.Tab])
    expect(await openOrFocus("https://example.com/a")).toBe("opened")
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: "https://example.com/a" })
  })
})

describe("openInCurrentWindow", () => {
  it("opens every URL as a background tab in this window", async () => {
    vi.mocked(chrome.windows.getCurrent).mockResolvedValue({ id: 4 } as chrome.windows.Window)
    await openInCurrentWindow(["https://a.com", "https://b.com"])
    expect(chrome.tabs.create).toHaveBeenNthCalledWith(1, { url: "https://a.com", windowId: 4, active: false })
    expect(chrome.tabs.create).toHaveBeenNthCalledWith(2, { url: "https://b.com", windowId: 4, active: false })
  })
})
