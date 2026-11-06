import { afterEach, describe, expect, it, vi } from "vitest"
import { commitOnBlur } from "./inlineEdit"

afterEach(() => vi.restoreAllMocks())

describe("commitOnBlur", () => {
  it("commits when focus moves elsewhere in the page", () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(true)
    const commit = vi.fn()
    commitOnBlur(commit)()
    expect(commit).toHaveBeenCalledOnce()
  })

  it("does not commit when the window itself loses focus", () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(false)
    const commit = vi.fn()
    commitOnBlur(commit)()
    expect(commit).not.toHaveBeenCalled()
  })
})
