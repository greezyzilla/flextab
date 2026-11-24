// TASK-103.5: the data colours moved into lib/data-colours.ts keep the exact values their call sites had.
import { describe, expect, it } from "vitest"
import { HUE_SPECTRUM, PROVIDER_BRAND, SPACE_COLOURS, hueColour, spaceColour } from "./data-colours"
import { SPACE_COLORS, SPACE_COLOR_NAMES } from "~src/components/settings/SpacesTab"
import { STARTERS } from "~src/components/layout/EmptyWorkspace"

describe("data colours", () => {
  it("keeps the stored space colours, their order and names (saved spaces hold these hex values)", () => {
    expect(SPACE_COLORS).toEqual(["", "#2274F0", "#8b5cf6", "#ec4899", "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4"])
    expect(SPACE_COLOR_NAMES).toEqual({ "": "Default", "#2274F0": "Blue", "#8b5cf6": "Violet", "#ec4899": "Pink", "#ef4444": "Red", "#f97316": "Orange", "#eab308": "Yellow", "#22c55e": "Green", "#06b6d4": "Cyan" })
    expect(SPACE_COLOURS).toHaveLength(8)
  })
  it("gives the empty workspace's starters colours from that palette", () => {
    expect(STARTERS.map((s) => s.color)).toEqual(["#2274F0", "#8b5cf6", "#22c55e", "#f97316"])
    expect(spaceColour("Orange")).toBe("#f97316")
  })
  it("draws hues and the hue track as before", () => {
    expect(hueColour(217)).toBe("hsl(217 85% 56%)")
    expect(HUE_SPECTRUM).toBe("linear-gradient(to right, hsl(0 85% 56%), hsl(60 85% 56%), hsl(120 85% 56%), hsl(180 85% 56%), hsl(240 85% 56%), hsl(300 85% 56%), hsl(360 85% 56%))")
  })
  it("keeps each provider's brand colours", () => {
    expect(PROVIDER_BRAND).toEqual({ googleBlue: "#4285F4", googleGreen: "#34A853", googleYellow: "#FBBC05", googleRed: "#EA4335", gitlab: "#FC6D26", discord: "#5865F2" })
  })
})
