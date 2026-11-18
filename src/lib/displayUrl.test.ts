import { describe, expect, it } from "vitest"
import { fitMiddle, fitTail, hasClippedText, splitDisplayUrl } from "./displayUrl"

describe("splitDisplayUrl (TASK-54)", () => {
  it("splits host and the rest, which together are the URL without its scheme", () => {
    const url = "https://v18.animestream.test/anime/2873/mikata/episode/1?t=3#c"
    const parts = splitDisplayUrl(url)!
    expect(parts).toEqual({ host: "v18.animestream.test", rest: "/anime/2873/mikata/episode/1?t=3#c" })
    expect(parts.host + parts.rest).toBe(url.replace(/^https?:\/\//, ""))
  })

  it("keeps a port with the host and handles a bare host, a query-only URL and http", () => {
    expect(splitDisplayUrl("http://localhost:8799/a")).toEqual({ host: "localhost:8799", rest: "/a" })
    expect(splitDisplayUrl("https://news.example.test")).toEqual({ host: "news.example.test", rest: "" })
    expect(splitDisplayUrl("https://example.test?q=1")).toEqual({ host: "example.test", rest: "?q=1" })
  })

  it("splits a local file as file:// and its path, so its file name stays in view", () => {
    expect(splitDisplayUrl("file:///Users/me/notes/readme.txt")).toEqual({ host: "file://", rest: "/Users/me/notes/readme.txt" })
  })

  it("returns null for other schemes and missing URLs", () => {
    expect(splitDisplayUrl("chrome://settings/")).toBeNull()
    expect(splitDisplayUrl(undefined)).toBeNull()
  })
})

describe("fitTail (TASK-54)", () => {
  // 6px per character, ellipsis included.
  const suffix = (rest: string) => (i: number) => (rest.length - i) * 6
  it("keeps the rest whole when it fits", () => {
    const rest = "/abs/2406.11234"
    expect(fitTail(rest, 200, suffix(rest), 6)).toEqual({ text: rest, cut: false })
  })
  it("keeps the longest end that fits after a tight ellipsis", () => {
    const rest = "/anime/2650/kusuriya-no-hitorigoto-season-2/episode/1"
    const r = fitTail(rest, 120, suffix(rest), 6) // a cut keeps 0.5px in hand: 19 characters incl. the ellipsis
    expect(r.cut).toBe(true)
    expect(r.text).toBe("…" + rest.slice(-18))
    expect(r.text.endsWith("/episode/1")).toBe(true)
    expect(r.text.length * 6).toBeLessThanOrEqual(119.5)
  })
  it("counts a text a hair wider than its box (sub-pixel rounding) as fitting", () => {
    const rest = "/abs/1"
    expect(fitTail(rest, 6 * rest.length - 0.01, suffix(rest), 6)).toEqual({ text: rest, cut: false })
  })
  it("falls back to a bare ellipsis when nothing else fits", () => {
    expect(fitTail("/very/long", 6, suffix("/very/long"), 6)).toEqual({ text: "…", cut: true })
  })
})

describe("fitMiddle (TASK-54 titles)", () => {
  const w = (from: number, to: number) => (to - from) * 6 // 6px per character
  it("keeps a title that fits", () => {
    expect(fitMiddle("Short title", 200, w, 6)).toEqual({ text: "Short title", cut: false })
  })
  it("keeps the start and the end, split evenly around a tight ellipsis", () => {
    const t = "Kusuriya no Hitorigoto Season 2 (Episode 02) Subtitle Indonesia"
    const r = fitMiddle(t, 120, w, 6) // 20 characters incl. the ellipsis
    expect(r.cut).toBe(true)
    const [start, end] = r.text.split("…")
    expect(t.startsWith(start)).toBe(true)
    expect(t.endsWith(end)).toBe(true)
    expect(Math.abs(start.length - end.length)).toBeLessThanOrEqual(2)
    expect(r.text.length * 6).toBeLessThanOrEqual(120)
  })
  it("drops spaces at the cut and never splits a surrogate pair", () => {
    const t = "ab 😀😀😀😀 cd"
    for (const width of [18, 24, 30, 36, 42, 48]) {
      const r = fitMiddle(t, width, w, 6)
      expect(r.text).not.toMatch(/ …|… /)
      expect(r.text).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/)
    }
  })
})

describe("hasClippedText", () => {
  it("also counts an address shortened by fitTail (data-cut)", () => {
    const root = document.createElement("div"), el = document.createElement("span")
    el.dataset.clip = ""; el.dataset.cut = "true"; root.append(el)
    expect(hasClippedText(root)).toBe(true)
  })

  const box = (scroll: number, client: number) => {
    const el = document.createElement("span"); el.dataset.clip = ""
    Object.defineProperty(el, "scrollWidth", { value: scroll }); Object.defineProperty(el, "clientWidth", { value: client })
    return el
  }
  it("is true only when a [data-clip] child overflows", () => {
    const root = document.createElement("div")
    root.append(box(100, 100))
    expect(hasClippedText(root)).toBe(false)
    root.append(box(180, 100))
    expect(hasClippedText(root)).toBe(true)
    expect(hasClippedText(null)).toBe(false)
  })
})
