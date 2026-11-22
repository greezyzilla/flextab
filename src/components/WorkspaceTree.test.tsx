import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { SourceColumnSkeleton } from "./WorkspaceTree"

afterEach(cleanup)

// Rows of the skeleton column: space rows sit directly in the outer list, group rows in a nested one.
const count = (c: HTMLElement) => ({
  spaces: c.querySelectorAll(":scope ul > li > div.px-1").length - c.querySelectorAll("ul ul > li > div.px-1").length,
  groups: c.querySelectorAll("ul ul > li > div.px-1").length,
  tabs: c.querySelectorAll("ul ul ul > li").length,
})

describe("SourceColumnSkeleton (TASK-106)", () => {
  it("draws a large version as one row per space", () => {
    const { container } = render(<SourceColumnSkeleton rows={8} label="Loading" />)
    expect(count(container)).toEqual({ spaces: 8, groups: 0, tabs: 0 })
  })

  it("draws a small version fully from its shape: groups, up to five tabs each, and the +N more line", () => {
    const { container } = render(<SourceColumnSkeleton rows={3} shape={[[2, 7], [3], []]} label="Loading" />)
    expect(count(container)).toEqual({ spaces: 3, groups: 3, tabs: 2 + 5 + 3 })
  })
})
