import { afterEach, describe, expect, it } from "vitest"

import { DEFAULT_APPEARANCE } from "./theme"
import { SETTINGS_SHAPE_STORAGE_KEY, currentDensity, measureSettingsPage, readStoredSettingsShape, settingsColumnWidth, storeSettingsShape } from "./settingsShape"

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

describe("measureSettingsPage reads the Settings page on screen", () => {
  const box = (el: HTMLElement, r: { top?: number; height: number; width?: number }) => {
    const top = r.top ?? 0
    el.getBoundingClientRect = () => ({ top, bottom: top + r.height, height: r.height, width: r.width ?? 0 }) as DOMRect
    return el
  }
  const el = (tag: string, children: HTMLElement[] = [], className = "") => {
    const e = document.createElement(tag)
    if (className) e.className = className
    e.append(...children)
    return e
  }

  function page() {
    const control = box(el("div"), { height: 32, width: 120 })
    const tileRow = box(el("div", [el("span"), el("div", [control])], "bg-row"), { height: 69.5 })
    tileRow.style.padding = "12px 0"
    const plainRow = box(el("div"), { height: 20.04 })
    const first = box(el("section", [el("header"), box(el("p"), { height: 40.25 }), el("div", [tileRow, plainRow])]), { top: 110, height: 190 })
    first.dataset.look = "card"
    const second = box(el("section", [el("header"), el("div", [box(el("div"), { height: 158 })])]), { top: 316, height: 160 })
    second.dataset.look = "card"
    return box(el("div", [first, second]), { top: 100, height: 400, width: 640.34 })
  }

  it("records each card's gap, notice and rows, a tile's content and control size, and the preview", () => {
    expect(measureSettingsPage(page(), box(el("aside"), { height: 535 }), "cozy")).toEqual({
      width: 640.3,
      density: "cozy",
      cards: [
        { gapBefore: 10, notice: 40.3, rows: [{ tile: true, content: 45.5, control: [120, 32] }, { tile: false, height: 20 }] },
        { gapBefore: 16, notice: null, rows: [{ tile: false, height: 158 }] },
      ],
      preview: 535,
    })
  })

  it("has no preview when none is shown or it has no height", () => {
    expect(measureSettingsPage(page(), null, "compact").preview).toBeNull()
    expect(measureSettingsPage(page(), box(el("aside"), { height: 0 }), "compact").preview).toBeNull()
  })
})

describe("currentDensity", () => {
  afterEach(() => document.documentElement.classList.remove("density-compact"))

  it("reads the density class on <html>", () => {
    document.documentElement.classList.add("density-compact")
    expect(currentDensity()).toBe("compact")
  })

  it("falls back to the default density when <html> has none", () => {
    expect(currentDensity()).toBe(DEFAULT_APPEARANCE.density)
  })
})
