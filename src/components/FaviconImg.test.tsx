import { fireEvent, render } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { FaviconImg } from "./FaviconImg"

const globe = (img: HTMLImageElement) => img.getAttribute("src")?.startsWith("data:image/svg+xml")

describe("FaviconImg: a favicon or the neutral globe, never a broken image (TASK-112)", () => {
  it("shows a web or data favicon as it is", () => {
    const { container } = render(<FaviconImg src="https://example.com/favicon.ico" />)
    expect(container.querySelector("img")).toHaveAttribute("src", "https://example.com/favicon.ico")
  })

  it("swaps a favicon that fails to load for the globe (Firefox keeps the site's own URL)", () => {
    const { container } = render(<FaviconImg src="https://gone.example/favicon.ico" />)
    const img = container.querySelector("img")!
    fireEvent.error(img)
    expect(globe(img)).toBe(true)
  })

  it.each(["moz-extension://uuid/icon.png", "chrome://favicon/x", "about:logo", undefined])("draws the globe for %s, which a page cannot load", (src) => {
    const { container } = render(<FaviconImg src={src} />)
    expect(globe(container.querySelector("img")!)).toBe(true)
  })
})
