import { describe, expect, it } from "vitest"
import { searchActions } from "./paletteActions"

describe("palette actions", () => {
  it("finds theme commands by title or keyword and marks the one in use", () => {
    expect(searchActions("dark", "system").map((h) => h.title)).toEqual(["Use dark theme"])
    const all = searchActions("theme", "light")
    expect(all.map((h) => h.theme)).toEqual(["system", "light", "dark"])
    expect(all.find((h) => h.current)?.theme).toBe("light")
    expect(searchActions("night", "dark")).toMatchObject([{ theme: "dark", current: true }])
    expect(searchActions("appear", "dark")).toHaveLength(3)
  })

  it("needs two letters and stays out of unrelated searches", () => {
    expect(searchActions("t", "system")).toEqual([])
    expect(searchActions("  ", "system")).toEqual([])
    expect(searchActions("react docs", "system")).toEqual([])
  })
})
