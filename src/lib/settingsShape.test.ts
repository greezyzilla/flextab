import { afterEach, describe, expect, it } from "vitest"

import { SETTINGS_SHAPE_STORAGE_KEY, readStoredSettingsShape, settingsColumnWidth, storeSettingsShape } from "./settingsShape"

afterEach(() => localStorage.clear())

describe("settingsColumnWidth", () => {
  it("follows the layout's breakpoints: no nav and less padding below md and sm", () => {
    expect(settingsColumnWidth(1440)).toBe(640)
    expect(settingsColumnWidth(800)).toBe(800 - 64 - 256 - 2 - 64)
    expect(settingsColumnWidth(700)).toBe(700 - 64 - 2 - 48)
    expect(settingsColumnWidth(500)).toBe(500 - 64 - 2 - 32)
    expect(settingsColumnWidth(50)).toBe(0)
  })
})

describe("a stored Settings shape that is not usable is dropped", () => {
  it.each([
    ["no record", null],
    ["a record without the signed-in flag", JSON.stringify({ pages: {} })],
    ["a record without pages", JSON.stringify({ signedIn: true })],
    ["malformed JSON", "{oops"],
  ])("reads %s as none", (_, raw) => {
    if (raw !== null) localStorage.setItem(SETTINGS_SHAPE_STORAGE_KEY, raw)
    expect(readStoredSettingsShape()).toBeNull()
  })

  it("drops a page list that is not a list, keeping the flag", () => {
    localStorage.setItem(SETTINGS_SHAPE_STORAGE_KEY, JSON.stringify({ signedIn: false, pages: { theme: "nope" } }))
    expect(readStoredSettingsShape()).toEqual({ signedIn: false, pages: {} })
  })

  it("keeps working when storage refuses the write", () => {
    const setItem = Storage.prototype.setItem
    Storage.prototype.setItem = () => { throw new Error("quota") }
    try {
      expect(() => storeSettingsShape("theme", { width: 640, density: "comfortable", cards: [] } as never, true)).not.toThrow()
    } finally { Storage.prototype.setItem = setItem }
  })
})
