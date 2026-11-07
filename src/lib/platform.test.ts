import { describe, expect, it } from "vitest"
import { isMac, shortcutKeys, shortcutLabel } from "./platform"

describe("platform shortcut labels (TASK-13)", () => {
  it("uses symbols on macOS and words elsewhere", () => {
    expect(shortcutLabel("Mod+K", true)).toBe("⌘K")
    expect(shortcutLabel("Mod+K", false)).toBe("Ctrl+K")
    expect(shortcutLabel("Alt+Shift+S", true)).toBe("⌥⇧S")
    expect(shortcutLabel("Alt+Shift+S", false)).toBe("Alt+Shift+S")
    expect(shortcutKeys("Command+Shift+W", true)).toEqual(["⌘", "⇧", "W"])
    expect(shortcutKeys("Command+Shift+W", false)).toEqual(["Ctrl", "Shift", "W"])
    expect(shortcutKeys("MacCtrl+Q", true)).toEqual(["⌃", "Q"])
    expect(shortcutKeys("?", false)).toEqual(["?"])
    expect(shortcutKeys("⌥⇧S", true)).toEqual(["⌥", "⇧", "S"]) // how Chrome reports it on macOS
    expect(shortcutKeys("", true)).toEqual([])
  })

  it("reads the platform from userAgentData, falling back to navigator.platform", () => {
    Object.defineProperty(navigator, "userAgentData", { value: { platform: "macOS" }, configurable: true })
    expect(isMac()).toBe(true)
    Object.defineProperty(navigator, "userAgentData", { value: { platform: "Windows" }, configurable: true })
    expect(isMac()).toBe(false)
    Object.defineProperty(navigator, "userAgentData", { value: undefined, configurable: true })
    Object.defineProperty(navigator, "platform", { value: "MacIntel", configurable: true })
    expect(isMac()).toBe(true)
    Object.defineProperty(navigator, "platform", { value: "", configurable: true })
  })
})
