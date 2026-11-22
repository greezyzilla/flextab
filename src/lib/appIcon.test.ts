import { describe, expect, it } from "vitest"
import { isTinted, readAppIconLook, tintPixels } from "./appIcon"

const px = (...rgba: number[]) => new Uint8ClampedArray(rgba)
const hueOf = ([r, g, b]: Uint8ClampedArray) => {
  const [R, G, B] = [r / 255, g / 255, b / 255], max = Math.max(R, G, B), min = Math.min(R, G, B), d = max - min
  const h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4
  return Math.round(h * 60)
}

describe("app icon (TASK-107)", () => {
  it("gives back the icon unchanged at the default accent", () => {
    const blue = px(37, 99, 235, 255, 20, 60, 160, 255)
    const copy = new Uint8ClampedArray(blue)
    tintPixels(copy, 214, 100)
    copy.forEach((v, i) => expect(Math.abs(v - blue[i])).toBeLessThanOrEqual(1))
  })

  it("moves every pixel's hue by the accent's distance from blue, keeping alpha and the fold's lightness", () => {
    const light = px(37, 99, 235, 255), dark = px(20, 60, 160, 200)
    const before = [hueOf(light), hueOf(dark)]
    tintPixels(light, 145, 100); tintPixels(dark, 145, 100)
    expect(Math.abs(hueOf(light) - (before[0] - 69))).toBeLessThanOrEqual(2)
    expect(Math.abs(hueOf(dark) - (before[1] - 69))).toBeLessThanOrEqual(2)
    expect(dark[3]).toBe(200)
    expect(Math.max(...light.slice(0, 3)) + Math.min(...light.slice(0, 3))).toBeGreaterThan(Math.max(...dark.slice(0, 3)) + Math.min(...dark.slice(0, 3)))
  })

  it("turns grey at no intensity and leaves clear pixels alone", () => {
    const p = px(37, 99, 235, 255, 1, 2, 3, 0)
    tintPixels(p, 145, 0)
    expect(p[0]).toBe(p[1]); expect(p[1]).toBe(p[2])
    expect([...p.slice(4)]).toEqual([1, 2, 3, 0])
  })

  it("draws only for Follow accent away from the default blue, and reads a broken copy as the default", () => {
    expect(isTinted({ hue: 214, intensity: 100, appIcon: "accent" })).toBe(false)
    expect(isTinted({ hue: 145, intensity: 100, appIcon: "accent" })).toBe(true)
    expect(isTinted({ hue: 145, intensity: 100, appIcon: "blue" })).toBe(false)
    expect(readAppIconLook({ hue: "x", intensity: 900, appIcon: "pink" })).toEqual({ hue: 214, intensity: 100, appIcon: "accent" })
  })
})
