import { afterEach, describe, expect, it, vi } from "vitest"
import { goBack } from "./route"

afterEach(() => vi.restoreAllMocks())

describe("goBack", () => {
  it("steps back in history when there is somewhere to go", () => {
    vi.spyOn(window.history, "length", "get").mockReturnValue(3)
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {})
    goBack()
    expect(back).toHaveBeenCalled()
  })

  it("goes to the workspace when the page was opened directly", () => {
    window.location.hash = "#/settings"
    vi.spyOn(window.history, "length", "get").mockReturnValue(1)
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {})
    goBack()
    expect(back).not.toHaveBeenCalled()
    expect(window.location.hash).toBe("#/")
  })
})
