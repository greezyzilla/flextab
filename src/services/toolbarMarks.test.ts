import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { defaultIconPaths, drawMarkedIcon, ICON_SIZES, MARKS, markedIconImages, resetMarkedIcons, type ToolbarMark } from "./toolbarMarks"

// jsdom has no canvas; this one records what is drawn. Real pixels are checked
// in toolbarMarks.browser.test.ts.
type Op = [string, ...unknown[]]
let ops: Op[]
class FakeCanvas {
  constructor(readonly width: number, readonly height: number) {}
  getContext() {
    const ctx: Record<string, unknown> = {}
    for (const name of ["drawImage", "beginPath", "arc", "fill", "fillRect"]) {
      ctx[name] = (...args: unknown[]) => { ops.push([name, ...args.map((a) => (typeof a === "number" ? +a.toFixed(3) : a))]) }
    }
    for (const prop of ["globalCompositeOperation", "fillStyle"]) {
      Object.defineProperty(ctx, prop, { set: (v) => ops.push([`${prop}=`, v]) })
    }
    ctx.getImageData = (_x: number, _y: number, w: number) => ({ drawnAt: w })
    return ctx
  }
}

/** The glyph's squares as a picture: "#" where ink lands, inside the disc's box. */
function glyphPicture(size: number): string[] {
  const corner = size / 2
  const grid = Array.from({ length: size / 2 }, () => Array(size / 2).fill("."))
  for (const [, x, y, w] of ops.filter(([op]) => op === "fillRect") as [string, number, number, number][]) {
    for (let dy = 0; dy < w; dy++) for (let dx = 0; dx < w; dx++) grid[y - corner + dy][x - corner + dx] = "#"
  }
  return grid.map((row) => row.join(""))
}

const MANIFEST = { action: { default_icon: { 16: "icon16.plasmo.png", 32: "icon32.plasmo.png", 48: "icon48.plasmo.png" } } }
const runtime = chrome.runtime as typeof chrome.runtime & { getManifest?: unknown }
let close: ReturnType<typeof vi.fn>

beforeEach(() => {
  ops = []
  close = vi.fn()
  resetMarkedIcons()
  vi.stubGlobal("OffscreenCanvas", FakeCanvas)
  vi.stubGlobal("createImageBitmap", vi.fn(async (blob: { from: string }) => ({ from: blob.from, close })))
  vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ blob: async () => ({ from: url }) })))
  runtime.getManifest = vi.fn(() => MANIFEST as unknown as chrome.runtime.Manifest)
})
afterEach(() => vi.unstubAllGlobals())
afterAll(() => { delete runtime.getManifest })

describe("MARKS", () => {
  // WCAG relative luminance contrast of each glyph on its disc.
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  it.each(Object.keys(MARKS) as ToolbarMark[])("%s reads at 4.5:1 or more", (mark) => {
    const [hi, lo] = [lum(MARKS[mark].fill), lum(MARKS[mark].ink)].sort((a, b) => b - a)
    expect((hi + 0.05) / (lo + 0.05)).toBeGreaterThanOrEqual(4.5)
  })
})

describe("drawMarkedIcon", () => {
  it("draws the icon, clears a ring, then the disc, then the glyph in whole pixels", () => {
    const base = {} as CanvasImageSource
    expect(drawMarkedIcon(base, 16, "saved")).toEqual({ drawnAt: 16 })
    expect(ops.slice(0, 10)).toEqual([
      ["drawImage", base, 0, 0, 16, 16],
      ["globalCompositeOperation=", "destination-out"],
      ["beginPath"], ["arc", 12, 12, 5, 0, 6.283], ["fill"],
      ["globalCompositeOperation=", "source-over"],
      ["fillStyle=", MARKS.saved.fill],
      ["beginPath"], ["arc", 12, 12, 4, 0, 6.283], ["fill"],
    ])
    expect(ops[10]).toEqual(["fillStyle=", MARKS.saved.ink])
    expect(ops.slice(11).every(([op, x, y]) => op === "fillRect" && Number.isInteger(x) && Number.isInteger(y))).toBe(true)
  })

  it("scales the disc and its ring with the icon", () => {
    drawMarkedIcon({} as CanvasImageSource, 32, "saved")
    expect(ops.filter(([op]) => op === "arc")).toEqual([["arc", 24, 24, 10, 0, 6.283], ["arc", 24, 24, 8, 0, 6.283]])
  })

  // The glyphs, square by square, in the disc's box (never crooked).
  it("draws a check, an exclamation and a cross, each centred in the disc", () => {
    const pictures = Object.fromEntries((["saved", "failed", "unsavable"] as ToolbarMark[]).flatMap((mark) => ICON_SIZES.map((size) => {
      ops = []
      drawMarkedIcon({} as CanvasImageSource, size, mark)
      return [`${mark}@${size}`, glyphPicture(size)]
    })))
    expect(pictures["saved@16"]).toEqual([
      "........",
      "........",
      ".....#..",
      "....#...",
      ".#.#....",
      "..#.....",
      "........",
      "........",
    ])
    expect(pictures["failed@16"]).toEqual([
      "........",
      "...##...",
      "...##...",
      "...##...",
      "........",
      "...##...",
      "...##...",
      "........",
    ])
    expect(pictures["unsavable@16"]).toEqual([
      "........",
      "........",
      "..#..#..",
      "...##...",
      "...##...",
      "..#..#..",
      "........",
      "........",
    ])
    expect(pictures["saved@32"]).toEqual([
      "................",
      "................",
      "................",
      "................",
      "...........##...",
      "..........###...",
      "...##....###....",
      "...###..###.....",
      "....######......",
      ".....####.......",
      "......##........",
      "................",
      "................",
      "................",
      "................",
      "................",
    ])
    expect(pictures["failed@32"]).toEqual([
      "................",
      "................",
      "................",
      ".......##.......",
      ".......##.......",
      ".......##.......",
      ".......##.......",
      ".......##.......",
      ".......##.......",
      ".......##.......",
      "................",
      ".......##.......",
      ".......##.......",
      "................",
      "................",
      "................",
    ])
    expect(pictures["unsavable@32"]).toEqual([
      "................",
      "................",
      "................",
      "................",
      "....##....##....",
      "....###..###....",
      ".....######.....",
      "......####......",
      "......####......",
      ".....######.....",
      "....###..###....",
      "....##....##....",
      "................",
      "................",
      "................",
      "................",
    ])
    // Every glyph keeps the same space on its left and right, and on its top and bottom, within a pixel
    // (the 16 px check is 5 wide in an 8 px disc, so it sits a pixel left, against its heavier long arm).
    for (const [name, rows] of Object.entries(pictures)) {
      const inked = rows.flatMap((row, y) => [...row].flatMap((c, x) => (c === "#" ? [[x, y]] : [])))
      const xs = inked.map(([x]) => x), ys = inked.map(([, y]) => y), n = rows.length
      expect(Math.abs(Math.min(...xs) - (n - 1 - Math.max(...xs))), name).toBeLessThanOrEqual(1)
      expect(Math.abs(Math.min(...ys) - (n - 1 - Math.max(...ys))), name).toBeLessThanOrEqual(1)
    }
  })
})

describe("markedIconImages", () => {
  it("draws the manifest's own icon at every toolbar size, once per worker and mark", async () => {
    expect(await markedIconImages("saved")).toEqual({ 16: { drawnAt: 16 }, 32: { drawnAt: 32 } })
    expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual(ICON_SIZES.map((s) => `chrome-extension://test/icon${s}.plasmo.png`))
    expect(close).toHaveBeenCalledTimes(2)
    await markedIconImages("saved")
    expect(fetch).toHaveBeenCalledTimes(2)
    await markedIconImages("failed")
    expect(fetch).toHaveBeenCalledTimes(4)
  })

  it("fetches the icon files by a path Firefox's getURL resolves too", async () => {
    // Firefox keeps a leading slash and nests the extension URL inside itself.
    const firefoxGetURL = (path: string) => `moz-extension://test/${path.startsWith("/") ? `moz-extension://test${path}` : path}`
    vi.mocked(chrome.runtime.getURL).mockImplementation(firefoxGetURL)
    try {
      await markedIconImages(null)
      expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual(ICON_SIZES.map((s) => `moz-extension://test/icon${s}.plasmo.png`))
    } finally {
      vi.mocked(chrome.runtime.getURL).mockImplementation((path: string) => `chrome-extension://test/${path}`)
    }
  })

  it("tries again after a failed draw", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("offline"))
    await expect(markedIconImages("saved")).rejects.toThrow("offline")
    expect(await markedIconImages("saved")).toEqual({ 16: { drawnAt: 16 }, 32: { drawnAt: 32 } })
  })

  it("keeps a newer drawing when an older one fails late", async () => {
    let fail!: (e: Error) => void
    vi.mocked(fetch).mockImplementationOnce(() => new Promise((_, reject) => { fail = reject }))
    const old = markedIconImages("saved")
    resetMarkedIcons()
    const fresh = markedIconImages("saved")
    fail(new Error("late"))
    await expect(old).rejects.toThrow("late")
    expect(markedIconImages("saved")).toBe(fresh)
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
