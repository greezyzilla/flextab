import { afterEach, describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { BrandMark } from "./brand-mark"

describe("BrandMark (TASK-102)", () => {
  const runtime = chrome.runtime as unknown as { getManifest?: () => unknown }
  afterEach(() => { delete runtime.getManifest })
  const withIcon = () => { runtime.getManifest = () => ({ icons: { "128": "icon128.png" } }) }

  it("names itself when given a label and paints the icon in a system colour under forced colours", () => {
    withIcon()
    render(<BrandMark label="FlexTab" />)
    const glyph = screen.getByRole("img", { name: "FlexTab" })
    expect(glyph.className).toContain("forced-colors:![background:CanvasText]")
    expect(glyph.className).toContain("forced-colors:[forced-color-adjust:none]")
    expect(glyph.getAttribute("style")).toContain("chrome-extension://test/icon128.png")
  })

  it("stays out of the accessibility tree without a label", () => {
    withIcon()
    const { container } = render(<BrandMark />)
    expect(screen.queryByRole("img")).toBeNull()
    expect(container.querySelector("[aria-hidden=true]")).not.toBeNull()
  })
})
