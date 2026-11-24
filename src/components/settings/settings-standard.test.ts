// Gate for docs/settings-standard.md: every Settings page speaks one
// design language, built only from the parts in shared.tsx.
import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const DIR = __dirname
const pages = readdirSync(DIR).filter((f) => /Tab\.tsx$/.test(f))
const read = (f: string) => readFileSync(join(DIR, f), "utf8")

/** The parts a page may build with; anything else from shared.tsx is a helper, not a layout part. */
const PARTS = new Set(["SettingsPage", "SettingsSection", "SettingRow", "SettingsList", "SettingsListRow", "SettingsNotice"])
const LAYOUT_LIKE = /^Settings[A-Z]|^SettingRow$/

describe("settings standard", () => {
  it("finds the pages it guards", () => {
    expect(pages).toEqual(expect.arrayContaining(["AccountTab.tsx", "AppearanceTab.tsx", "BackupTab.tsx", "PlanTab.tsx", "SavingTab.tsx", "SpacesTab.tsx", "SyncTab.tsx", "TransactionsTab.tsx"]))
  })

  it("builds every page only from the standard parts", () => {
    const offenders = pages.flatMap((f) => {
      const imp = read(f).match(/import \{([^}]*)\} from "\.\/shared"/)
      const names = imp ? imp[1].split(",").map((n) => n.trim().replace(/^type /, "")).filter(Boolean) : []
      return names.filter((n) => LAYOUT_LIKE.test(n) && !PARTS.has(n)).map((n) => `${f}: ${n}`)
    })
    expect(offenders).toEqual([])
  })

  it("draws no containers of its own on a page (no Card, no box per item)", () => {
    const offenders = pages.flatMap((f) => {
      const src = read(f)
      const hits: string[] = []
      if (/from "~src\/components\/ui\/card"/.test(src)) hits.push(`${f}: imports Card`)
      if (/bg-ink\/\[0\.02\]/.test(src)) hits.push(`${f}: draws a box per item`)
      return hits
    })
    expect(offenders).toEqual([])
  })

  it("keeps the header to the page title alone", () => {
    const shell = read("SettingsShell.tsx")
    const header = shell.slice(shell.indexOf("min-h-16"), shell.indexOf("overflow-y-auto"))
    expect(header).not.toMatch(/<Button|Reset/)
  })

  it("keeps one control column: at least 16rem, wider only for its content (rule 4), once the row has room", () => {
    const css = readFileSync(join(DIR, "..", "..", "..", "style.css"), "utf8")
    expect(read("shared.tsx")).toContain('"ft-setting-tile rounded-lg bg-row"')
    expect(read("shared.tsx")).toContain("ft-setting-rows")
    expect(css).toMatch(/\.ft-setting-rows \{ container-type: inline-size; \}/)
    expect(css).toMatch(/@container \(min-width: 34rem\) \{\s*\.ft-setting-tile \{ display: grid; grid-template-columns: minmax\(0, 1fr\) minmax\(16rem, max-content\);/)
  })

  it("gives every field one look, no fill and an ink/25 edge, with no tile override (rule 7)", () => {
    expect(readFileSync(join(DIR, "..", "ui", "input.tsx"), "utf8")).toContain('const fieldFrame = "rounded-md border border-ink/25 bg-transparent transition-colors"')
    expect(read("shared.tsx")).not.toMatch(/\[&_input\]:/)
  })

  it("draws the dropdown trigger as the choice button (rule 5)", () => {
    const select = readFileSync(join(DIR, "..", "ui", "select.tsx"), "utf8")
    expect(select).toMatch(/toggleVariants\(\{ variant: "outline", size: "sm" \}\)/)
  })

  it("shows the Appearance preview only from 1440px, capped at 24rem (rule 10)", () => {
    expect(read("SettingsShell.tsx")).toMatch(/className="hidden preview:block preview:max-w-\[24rem\]/)
    expect(read("../../../tailwind.config.js")).toMatch(/preview: "1440px"/)
  })

  it("decides a guest's missing pages from one list (Pages)", () => {
    const types = read("types.ts")
    expect(types).toContain('export const ACCOUNT_ONLY: SettingsTab[] = ["profile", "security", "plan"]')
    // The nav, the narrow selector (both via settingsGroupsFor) and routing (tabFromRoute) all read it.
    expect(types).toMatch(/function settingsGroupsFor[\s\S]*?ACCOUNT_ONLY/)
    expect(types).toMatch(/function tabFromRoute[\s\S]*?ACCOUNT_ONLY/)
    expect(read("SettingsShell.tsx").match(/settingsGroupsFor\(signedIn\)/g)?.length).toBe(2)
  })

  it("puts no em dash in anything a page shows (rule 11)", () => {
    const offenders = pages.flatMap((f) => read(f).split("\n").map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => line.includes("—") && !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(line))
      .map(({ n }) => `${f}:${n}`))
    expect(offenders).toEqual([])
  })
})
