import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { DENSITY_ROW_PY, TREE_LABEL_BOX } from "~src/components/ui/tree-row-button"
import { PANEL_ROW_LABEL } from "./panelChrome"
import { ShellSkeletonView } from "./ShellSkeleton"
import type { ShellShape } from "~src/lib/shellShape"

/*
 * TASK-128: Density covers every list row on the new tab page, not only the saved tabs. The sidebar
 * tree (and the Settings nav, which shares its rows, TASK-82) and Opened Tabs take their vertical
 * padding from --density-py-row; Comfortable keeps the old py-1.5.
 */

const css = readFileSync(resolve(__dirname, "../../../style.css"), "utf8")
const block = (density: string) => css.match(new RegExp(`:root\\.density-${density}\\s*\\{([^}]*)\\}`))?.[1] ?? ""
const rowPadding = (density: string) => block(density).match(/--density-py-row:\s*([\d.]+)rem/)?.[1]

afterEach(cleanup)

describe("list row density (TASK-128)", () => {
  it("defines the row padding for every density, Comfortable as before (py-1.5)", () => {
    expect(rowPadding("comfortable")).toBe("0.375")
    expect(rowPadding("cozy")).toBe("0.25")
    expect(rowPadding("compact")).toBe("0.1875")
  })

  it("makes a tree row 32 / 28 / 26px: a 20px name line plus the padding, never under its 26px action slot", () => {
    const height = (density: string) => Math.max(26, 20 + Number(rowPadding(density)) * 16 * 2)
    expect([height("comfortable"), height("cozy"), height("compact")]).toEqual([32, 28, 26])
  })

  it("puts the padding on the tree's label box, which the Settings nav shares, so the left panel matches on both routes", () => {
    expect(TREE_LABEL_BOX).toContain(DENSITY_ROW_PY)
    expect(PANEL_ROW_LABEL).toBe(TREE_LABEL_BOX)
    expect(TREE_LABEL_BOX).not.toContain("py-1.5")
  })

  it("draws the loading skeleton's tree and Opened Tabs rows from the same padding", () => {
    const shape: ShellShape = {
      spaces: 1,
      projects: [{ open: true, categories: [2, 0] }, { open: false, categories: [] }],
      active: [0, 0],
      content: { layout: "list", gridColumns: 2, projectHasGroups: true, sections: [{ unsorted: 0, groups: [3] }] },
      windows: [4],
      anyTabs: true,
    }
    const { container } = render(<ShellSkeletonView shape={shape} leftInline rightInline />)
    const sized = Array.from(container.querySelectorAll<HTMLElement>("div")).filter((el) => el.style.height.includes("--density-py-row"))
    // Two projects and their two categories, each as tall as a real tree row.
    expect(sized).toHaveLength(4)
    const openRows = Array.from(container.querySelectorAll<HTMLElement>("div")).filter((el) => el.className.includes(DENSITY_ROW_PY))
    expect(openRows).toHaveLength(4)
  })
})
