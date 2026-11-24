import { describe, expect, it } from "vitest"
import { drawMarkedIcon, MARKS, type ToolbarMark } from "./toolbarMarks"

// The marks in a real canvas: where they land, that their glyph is crisp, and
// that they keep clear of the logo.
const BASE = "#2563eb"
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

function solidIcon(size: number): OffscreenCanvas {
  const canvas = new OffscreenCanvas(size, size)
  const ctx = canvas.getContext("2d")!
  ctx.fillStyle = BASE
  ctx.fillRect(0, 0, size, size)
  return canvas
}

const pixel = (image: ImageData, x: number, y: number) => Array.from(image.data.slice((y * image.width + x) * 4, (y * image.width + x) * 4 + 4))

describe("drawMarkedIcon in a real canvas", () => {
  for (const mark of Object.keys(MARKS) as ToolbarMark[]) {
    for (const size of [16, 32]) {
      it(`puts the ${mark} mark in the bottom-right corner of the ${size} px icon`, () => {
        const image = drawMarkedIcon(solidIcon(size), size, mark)
        const s = size / 16
        // The logo is untouched outside the mark.
        expect(pixel(image, 2 * s, 2 * s)).toEqual([...rgb(BASE), 255])
        expect(pixel(image, 2 * s, 14 * s)).toEqual([...rgb(BASE), 255])
        // A clear ring separates the disc from the logo.
        expect(pixel(image, Math.floor(7.4 * s), Math.floor(12 * s))[3]).toBeLessThan(128)
        // Inside the disc, every pixel of the glyph is exactly its ink colour: whole pixels, no blur.
        const disc: number[][] = []
        for (let y = 10 * s; y < 14 * s; y++) for (let x = 10 * s; x < 14 * s; x++) disc.push(pixel(image, x, y))
        const ink = disc.filter((p) => p.slice(0, 3).join() === rgb(MARKS[mark].ink).join())
        const fill = disc.filter((p) => p.slice(0, 3).join() === rgb(MARKS[mark].fill).join())
        expect(ink.length).toBeGreaterThan(0)
        expect(ink.length + fill.length).toBe(disc.length)
      })
    }
  }
})
