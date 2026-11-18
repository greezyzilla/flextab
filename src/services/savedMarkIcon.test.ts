import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { defaultIconPaths, drawSavedIcon, ICON_SIZES, resetSavedIcon, SAVED_MARK, savedIconImages } from "./savedMarkIcon"

// jsdom has no canvas; this one records what is drawn. Real pixels are checked
// in savedMarkIcon.browser.test.ts.
type Op = [string, ...unknown[]]
let ops: Op[]
class FakeCanvas {
  constructor(readonly width: number, readonly height: number) {}
  getContext() {
    const ctx: Record<string, unknown> = {}
    for (const name of ["drawImage", "beginPath", "arc", "fill", "moveTo", "lineTo", "stroke"]) {
      ctx[name] = (...args: unknown[]) => { ops.push([name, ...args.map((a) => (typeof a === "number" ? +a.toFixed(3) : a))]) }
    }
    for (const prop of ["globalCompositeOperation", "fillStyle", "strokeStyle", "lineWidth", "lineCap", "lineJoin"]) {
      Object.defineProperty(ctx, prop, { set: (v) => ops.push([`${prop}=`, v]) })
    }
    ctx.getImageData = (_x: number, _y: number, w: number) => ({ drawnAt: w })
    return ctx
  }
}

const MANIFEST = { action: { default_icon: { 16: "icon16.plasmo.png", 32: "icon32.plasmo.png", 48: "icon48.plasmo.png" } } }
const runtime = chrome.runtime as typeof chrome.runtime & { getManifest?: unknown }
let close: ReturnType<typeof vi.fn>

beforeEach(() => {
  ops = []
  close = vi.fn()
  resetSavedIcon()
  vi.stubGlobal("OffscreenCanvas", FakeCanvas)
  vi.stubGlobal("createImageBitmap", vi.fn(async (blob: { from: string }) => ({ from: blob.from, close })))
  vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ blob: async () => ({ from: url }) })))
  runtime.getManifest = vi.fn(() => MANIFEST as unknown as chrome.runtime.Manifest)
})
afterEach(() => vi.unstubAllGlobals())
afterAll(() => { delete runtime.getManifest })

describe("SAVED_MARK", () => {
  // WCAG relative luminance contrast of the check on its disc.
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  it("reads at 4.5:1 or more, and is the 8 px mark the user chose", () => {
    const [hi, lo] = [lum(SAVED_MARK.fill), lum(SAVED_MARK.check)].sort((a, b) => b - a)
    expect((hi + 0.05) / (lo + 0.05)).toBeGreaterThanOrEqual(4.5)
    expect(16 * SAVED_MARK.ratio).toBe(8)
  })
})

describe("drawSavedIcon", () => {
  it("draws the icon, clears a ring, then the green disc and the dark check in the corner", () => {
    const base = {} as CanvasImageSource
    expect(drawSavedIcon(base, 16)).toEqual({ drawnAt: 16 })
    expect(ops).toEqual([
      ["drawImage", base, 0, 0, 16, 16],
      ["globalCompositeOperation=", "destination-out"],
      ["beginPath"], ["arc", 12, 12, 5, 0, 6.283], ["fill"],
      ["globalCompositeOperation=", "source-over"],
      ["fillStyle=", SAVED_MARK.fill],
      ["beginPath"], ["arc", 12, 12, 4, 0, 6.283], ["fill"],
      ["strokeStyle=", SAVED_MARK.check],
      ["lineWidth=", 1.36], ["lineCap=", "round"], ["lineJoin=", "round"],
      ["beginPath"], ["moveTo", 10.2, 12.08], ["lineTo", 11.6, 13.52], ["lineTo", 14, 10.6], ["stroke"],
    ])
  })

  it("scales the mark and its ring with the icon", () => {
    drawSavedIcon({} as CanvasImageSource, 32)
    expect(ops.filter(([op]) => op === "arc")).toEqual([["arc", 24, 24, 10, 0, 6.283], ["arc", 24, 24, 8, 0, 6.283]])
  })
})

describe("savedIconImages", () => {
  it("draws the manifest's own icon at every toolbar size, once per worker", async () => {
    expect(await savedIconImages()).toEqual({ 16: { drawnAt: 16 }, 32: { drawnAt: 32 } })
    expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual(ICON_SIZES.map((s) => `chrome-extension://test//icon${s}.plasmo.png`))
    expect(close).toHaveBeenCalledTimes(2)
    await savedIconImages()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it("tries again after a failed draw", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("offline"))
    await expect(savedIconImages()).rejects.toThrow("offline")
    expect(await savedIconImages()).toEqual({ 16: { drawnAt: 16 }, 32: { drawnAt: 32 } })
  })

  it("keeps a newer drawing when an older one fails late", async () => {
    let fail!: (e: Error) => void
    vi.mocked(fetch).mockImplementationOnce(() => new Promise((_, reject) => { fail = reject }))
    const old = savedIconImages()
    resetSavedIcon()
    const fresh = savedIconImages()
    fail(new Error("late"))
    await expect(old).rejects.toThrow("late")
    expect(savedIconImages()).toBe(fresh)
  })
})

describe("defaultIconPaths", () => {
  it("is the manifest's toolbar icon, from the extension root rather than the worker's folder", () => {
    expect(defaultIconPaths()).toEqual({ 16: "/icon16.plasmo.png", 32: "/icon32.plasmo.png", 48: "/icon48.plasmo.png" })
    MANIFEST.action.default_icon[16] = "/already/rooted.png"
    expect(defaultIconPaths()[16]).toBe("/already/rooted.png")
    MANIFEST.action.default_icon[16] = "icon16.plasmo.png"
  })
})
