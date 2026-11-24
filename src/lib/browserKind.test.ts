import { afterEach, describe, expect, it, vi } from "vitest"

import { browserName, isFirefox, openShortcutSettings } from "./browserKind"

const runtime = chrome.runtime as unknown as Record<string, unknown>
const c = chrome as unknown as Record<string, unknown>

afterEach(() => {
  delete runtime.getBrowserInfo
  delete c.commands
})

describe("browserKind", () => {
  it("is Chrome without runtime.getBrowserInfo, Firefox with it", () => {
    expect(isFirefox()).toBe(false)
    expect(browserName()).toBe("Chrome")
    runtime.getBrowserInfo = vi.fn()
    expect(isFirefox()).toBe(true)
    expect(browserName()).toBe("Firefox")
  })

  it("opens Firefox's own shortcut screen, which no URL reaches", () => {
    const openShortcutSettingsApi = vi.fn(async () => {})
    c.commands = { openShortcutSettings: openShortcutSettingsApi }
    openShortcutSettings()
    expect(openShortcutSettingsApi).toHaveBeenCalledOnce()
    expect(chrome.tabs.create).not.toHaveBeenCalledWith({ url: "chrome://extensions/shortcuts" })
  })

  it("does nothing outside an extension, where opening a tab throws", () => {
    vi.mocked(chrome.tabs.create).mockImplementationOnce(() => { throw new Error("no extension context") })
    expect(() => openShortcutSettings()).not.toThrow()
  })

  it("opens chrome://extensions/shortcuts in Chrome", () => {
    vi.mocked(chrome.tabs.create).mockClear()
    openShortcutSettings()
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: "chrome://extensions/shortcuts" })
  })
})
