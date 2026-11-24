import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { SETTINGS_SKELETON_STORAGE_KEY, SettingsSkeleton, SettingsSkeletonView, settingsSkeletonFor, storeSettingsSkeletonMarkup } from "./SettingsSkeleton"
import { SHELL_SKELETON_STORAGE_KEY, skeletonHeight } from "./ShellSkeleton"
import { SETTINGS_TABS } from "~src/components/settings/types"
import { SAMPLE_PAGES, SETTINGS_SHAPE_STORAGE_KEY, readStoredSettingsShape, settingsColumnWidth, settingsPageShape, storeSettingsShape, type SettingsPageShape } from "~src/lib/settingsShape"
const sample = (t: keyof typeof SAMPLE_PAGES): SettingsPageShape => ({ width: W, density: "comfortable", ...SAMPLE_PAGES[t] })

const shellJs = readFileSync(resolve(__dirname, "../../boot/shell.js"), "utf8")
const runShell = (hash: string) => {
  window.location.hash = hash
  document.body.innerHTML = '<div id="boot-skeleton" aria-hidden="true"></div>'
  new Function(shellJs)()
  return document.getElementById("boot-skeleton")!.innerHTML
}
const W = settingsColumnWidth(window.innerWidth)
const page: SettingsPageShape = {
  width: W,
  density: "comfortable",
  cards: [
    { gapBefore: 0, notice: 44, rows: [{ tile: true, content: 42, control: [256, 32] }, { tile: false, height: 120 }] },
    { gapBefore: 40, notice: null, rows: [{ tile: true, content: 50, control: [44, 20] }] },
  ],
  preview: 535,
}
// boot/look.js puts the density on <html> before the shell script runs.
beforeEach(() => { document.documentElement.classList.add("density-comfortable") })
afterEach(() => { cleanup(); localStorage.clear(); window.location.hash = ""; document.body.innerHTML = ""; document.documentElement.classList.remove("density-comfortable") })

describe("the Settings page's loading shell", () => {
  it("draws the Settings nav for the user's groups with the open topic lit, and the page's cards and rows", () => {
    storeSettingsShape("display", page, true)
    const { container } = render(<SettingsSkeleton route="/settings/display" />)
    expect(screen.getByRole("status", { name: "Loading Settings" })).toBeInTheDocument()
    // Nine topics under three headings, the open one with the accent fill.
    const rows = container.querySelectorAll(".mx-2.pl-1")
    expect(rows).toHaveLength(9)
    expect((rows[SETTINGS_TABS.indexOf("display")] as HTMLElement).style.backgroundColor).toBe("var(--accent-subtle)")
    const cards = container.querySelectorAll(".rounded-card")
    expect(cards).toHaveLength(2)
    expect((cards[1] as HTMLElement).style.marginTop).toBe("40px")
    expect(container.querySelectorAll(".bg-row")).toHaveLength(2)
  })

  it("a guest's nav has no Account group, and an account route opens the default page as SettingsContent does", () => {
    storeSettingsShape("theme", sample("theme"), false)
    expect(settingsSkeletonFor("/settings/plan")).toMatchObject({ tab: "theme", signedIn: false })
    const { container } = render(<SettingsSkeleton route="/settings/plan" />)
    expect(container.querySelectorAll(".mx-2.pl-1")).toHaveLength(6)
  })

  it("the Spaces page draws its tab strip in the room before its first card, one chip per space", () => {
    localStorage.setItem("flextab-shell-shape", JSON.stringify({ spaces: 3, projects: [], active: null, content: null, windows: [] }))
    const spacesPage: SettingsPageShape = { ...page, cards: [{ ...page.cards[0], gapBefore: 77 }, page.cards[1]] }
    storeSettingsShape("spaces", spacesPage, true)
    const { container } = render(<SettingsSkeleton route="/settings/spaces" />)
    const strip = container.querySelector(".border-ink\\/10.pb-3") as HTMLElement
    expect(strip.style.height).toBe("49px")
    expect(strip.children).toHaveLength(3)
    expect((strip.children[0] as HTMLElement).style.backgroundColor).toBe("var(--accent-subtle)")
    expect((container.querySelectorAll(".rounded-card")[0] as HTMLElement).style.marginTop).toBe("28px")
    // Other pages draw no strip.
    cleanup()
    storeSettingsShape("backup", spacesPage, true)
    expect(render(<SettingsSkeleton route="/settings/backup" />).container.querySelector(".border-ink\\/10.pb-3")).toBeNull()
  })

  it("a page never opened uses its topic's sample", () => {
    expect(settingsSkeletonFor("/settings/backup").page).toEqual(sample("backup"))
    expect(settingsSkeletonFor("/settings/sync").tab).toBe("backup")
  })

  it("keeps a shape per window width and draws the one seen at the nearest width", () => {
    const at = (width: number, gapBefore: number): SettingsPageShape => ({ ...page, width, cards: [{ ...page.cards[0], gapBefore }] })
    storeSettingsShape("backup", at(1440, 1), true)
    storeSettingsShape("backup", at(600, 2), true)
    storeSettingsShape("backup", at(1440, 3), true)
    expect(readStoredSettingsShape()!.pages.backup!.map((p) => [p.width, p.cards[0].gapBefore])).toEqual([[1440, 3], [600, 2]])
    expect(settingsPageShape(readStoredSettingsShape(), "backup", 1400, "comfortable").cards[0].gapBefore).toBe(3)
    expect(settingsPageShape(readStoredSettingsShape(), "backup", 700, "comfortable").cards[0].gapBefore).toBe(2)
    // Another density at the same width is its own shape, and the same density wins over a nearer width.
    storeSettingsShape("backup", { ...at(600, 4), density: "compact" }, true)
    expect(readStoredSettingsShape()!.pages.backup).toHaveLength(3)
    expect(settingsPageShape(readStoredSettingsShape(), "backup", 1440, "compact").cards[0].gapBefore).toBe(4)
    for (const w of [300, 320, 340, 360, 380, 400, 420, 440, 460, 480, 500]) storeSettingsShape("backup", at(w, 0), true)
    expect(readStoredSettingsShape()!.pages.backup).toHaveLength(12)
  })

  it("works out the controls column's width as SettingsContent lays it out", () => {
    // Measured in a production build: 640 from about 1024 up, 638 at 1024.
    expect(settingsColumnWidth(1440)).toBe(640)
    expect(settingsColumnWidth(1024)).toBe(638)
    expect(settingsColumnWidth(768)).toBe(382)
    expect(settingsColumnWidth(600)).toBe(502)
  })

  it("drops a stored page that is not a valid shape", () => {
    localStorage.setItem(SETTINGS_SHAPE_STORAGE_KEY, JSON.stringify({ signedIn: true, pages: { theme: [{ width: W, cards: [{ gapBefore: -1 }] }], layout: [page], spaces: page } }))
    expect(readStoredSettingsShape()?.pages).toEqual({ layout: [page] })
    localStorage.setItem(SETTINGS_SHAPE_STORAGE_KEY, "{broken")
    expect(readStoredSettingsShape()).toBeNull()
  })

  it("keeps each topic's markup, the same React draws, and a guest keeps no account page", () => {
    storeSettingsShape("security", sample("security"), true)
    storeSettingsSkeletonMarkup("security")
    storeSettingsShape("layout", page, true)
    storeSettingsSkeletonMarkup("layout")
    const copies = JSON.parse(localStorage.getItem(SETTINGS_SKELETON_STORAGE_KEY)!)
    const { container } = render(<SettingsSkeletonView {...settingsSkeletonFor("/settings/layout")} />)
    expect(copies.layout).toEqual({ html: container.innerHTML, height: skeletonHeight(), width: window.innerWidth, density: "comfortable" })
    expect(copies.security).toBeDefined()
    storeSettingsShape("layout", page, false)
    storeSettingsSkeletonMarkup("layout")
    expect(Object.keys(JSON.parse(localStorage.getItem(SETTINGS_SKELETON_STORAGE_KEY)!))).toEqual(["layout"])
  })

  it("boot/shell.js puts in the open topic's copy, resolves old names and the default, and leaves the surface otherwise", () => {
    storeSettingsShape("backup", page, true)
    storeSettingsSkeletonMarkup("backup")
    storeSettingsShape("theme", page, true)
    storeSettingsSkeletonMarkup("theme")
    const copies = JSON.parse(localStorage.getItem(SETTINGS_SKELETON_STORAGE_KEY)!)
    expect(runShell("#/settings/backup")).toBe(copies.backup.html)
    expect(runShell("#/settings/sync")).toBe(copies.backup.html)
    expect(runShell("#/settings")).toBe(copies.theme.html)
    expect(runShell("#/settings/display")).toBe("")
    // A copy drawn at another window width is not used: its rows wrap differently.
    localStorage.setItem(SETTINGS_SKELETON_STORAGE_KEY, JSON.stringify({ ...copies, backup: { ...copies.backup, width: window.innerWidth + 1 } }))
    expect(runShell("#/settings/backup")).toBe("")
    // Nor one drawn at another density.
    localStorage.setItem(SETTINGS_SKELETON_STORAGE_KEY, JSON.stringify({ ...copies, backup: { ...copies.backup, density: "compact" } }))
    expect(runShell("#/settings/backup")).toBe("")
    // A Settings route never falls back to the workspace copy.
    localStorage.setItem(SHELL_SKELETON_STORAGE_KEY, JSON.stringify({ html: "<p>workspace</p>", leftInline: false, rightInline: false, height: skeletonHeight() }))
    expect(runShell("#/settings/display")).toBe("")
    localStorage.setItem(SETTINGS_SKELETON_STORAGE_KEY, "{broken")
    expect(runShell("#/settings/backup")).toBe("")
  })

  it("boot/shell.js knows the same topics and old names as settings/types", () => {
    for (const t of SETTINGS_TABS) expect(shellJs).toContain(`"${t}"`)
    for (const [from, to] of [["appearance", "theme"], ["account", "profile"], ["transactions", "plan"], ["opening", "saving"], ["sync", "backup"]]) expect(shellJs).toContain(`${from}: "${to}"`)
  })
})
