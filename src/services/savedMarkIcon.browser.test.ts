import { describe, expect, it } from "vitest"
import { drawSavedIcon, SAVED_MARK } from "./savedMarkIcon"

// The saved mark in a real canvas: where it lands and that it keeps clear of the logo.
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
const near = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]) <= 8)

describe("drawSavedIcon in a real canvas", () => {
  for (const size of [16, 32]) {
    it(`marks the bottom-right corner of the ${size} px icon and leaves the rest of the logo`, () => {
      const image = drawSavedIcon(solidIcon(size), size)
      const s = size / 16
      // The logo is untouched outside the mark.
      expect(pixel(image, 2 * s, 2 * s)).toEqual([...rgb(BASE), 255])
      expect(pixel(image, 2 * s, 14 * s)).toEqual([...rgb(BASE), 255])
      // The disc is green where the check isn't.
      expect(near(pixel(image, 12 * s, 9 * s), [...rgb(SAVED_MARK.fill), 255])).toBe(true)
      // The check runs through the disc in the dark colour (antialiased at 16 px, so near it).
      const disc: number[][] = []
      for (let y = 8 * s; y < 16 * s; y++) for (let x = 8 * s; x < 16 * s; x++) disc.push(pixel(image, x, y))
      expect(disc.some((p) => p.slice(0, 3).every((v, i) => Math.abs(v - rgb(SAVED_MARK.check)[i]) <= 40))).toBe(true)
      // A clear ring separates the disc from the logo.
      expect(pixel(image, Math.floor(7.4 * s), Math.floor(12 * s))[3]).toBeLessThan(128)
    })
  }
})
