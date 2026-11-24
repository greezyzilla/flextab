import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { SHELL_SKELETON_STORAGE_KEY, ShellSkeletonView, skeletonHeight, storeShellSkeletonMarkup } from "./ShellSkeleton"
import { LEFT_INLINE_QUERY, RIGHT_INLINE_QUERY } from "~src/hooks/useMediaQuery"
import { storeShellShape, type ShellShape } from "~src/lib/shellShape"

const shape: ShellShape = {
  spaces: 3,
  projects: [{ open: true, categories: [2, 0] }],
  active: [0, 0],
  content: { layout: "grid", gridColumns: 3, projectHasGroups: true, sections: [{ unsorted: 1, groups: [4, 0] }] },
  windows: [5],
  anyTabs: true,
}
const shellJs = readFileSync(resolve(__dirname, "../../boot/shell.js"), "utf8")
let wide = true
beforeEach(() => {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: wide && (q === LEFT_INLINE_QUERY || q === RIGHT_INLINE_QUERY), media: q, addEventListener() {}, removeEventListener() {} }))
})
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); wide = true; document.body.innerHTML = "" })

describe("the new tab's boot skeleton (TASK-107)", () => {
  it("keeps the markup React draws for the stored shape and this layout", () => {
    storeShellShape(shape)
    storeShellSkeletonMarkup()
    const copy = JSON.parse(localStorage.getItem(SHELL_SKELETON_STORAGE_KEY)!)
    const { container } = render(<ShellSkeletonView shape={shape} leftInline rightInline />)
    expect(copy).toMatchObject({ leftInline: true, rightInline: true, height: skeletonHeight() })
    expect(copy.html).toBe(container.innerHTML)
    expect(copy.html).toContain('aria-label="Loading your workspace"')
  })

  it("boot/shell.js puts it in the page when the layout and screen match, and leaves the surface otherwise", () => {
    storeShellShape(shape)
    storeShellSkeletonMarkup()
    const html = JSON.parse(localStorage.getItem(SHELL_SKELETON_STORAGE_KEY)!).html
    const run = () => { document.body.innerHTML = '<div id="boot-skeleton" aria-hidden="true"></div>'; new Function(shellJs)(); return document.getElementById("boot-skeleton")!.innerHTML }
    expect(run()).toBe(html)
    wide = false
    expect(run()).toBe("")
    wide = true
    localStorage.setItem(SHELL_SKELETON_STORAGE_KEY, "{broken")
    expect(run()).toBe("")
  })

  it("boot/shell.js uses the same breakpoints as the shell", () => {
    expect(shellJs).toContain(`matchMedia("${LEFT_INLINE_QUERY}")`)
    expect(shellJs).toContain(`matchMedia("${RIGHT_INLINE_QUERY}")`)
  })
})

describe("the skeleton's panel footer (TASK-109)", () => {
  it("is drawn like PanelFooter: the version line on the left, Shortcuts on the right", () => {
    const { container } = render(<ShellSkeletonView shape={shape} leftInline rightInline />)
    const footer = Array.from(container.querySelectorAll("div.border-t")).find(el => el.className.includes("justify-between"))!
    expect(footer).toBeTruthy()
    expect(footer.children).toHaveLength(2)
    expect((footer.children[0] as HTMLElement).style.height).toBe("16px")
  })
})
