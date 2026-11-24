import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { render } from "@testing-library/react"
import { Folder } from "lucide-react"
import { beforeEach, describe, expect, it } from "vitest"
import { Icon, ICON_STROKES } from "~src/components/ui/icon"
import { useSettingsStore } from "~src/store/useSettingsStore"

const svg = (el: HTMLElement) => el.querySelector("svg")!

describe("Icon", () => {
  beforeEach(() => useSettingsStore.setState({ iconWeight: "regular" }))

  it("draws at the scale size and the regular weight, hidden from assistive tech", () => {
    const { container } = render(<Icon icon={Folder} size="md" className="text-fg-subtle" />)
    expect(svg(container).getAttribute("class")).toContain("h-4 w-4")
    expect(svg(container).getAttribute("class")).toContain("text-fg-subtle")
    expect(svg(container).getAttribute("stroke-width")).toBe(String(ICON_STROKES.regular))
    expect(svg(container).getAttribute("aria-hidden")).toBe("true")
  })

  it("follows the weight chosen in Settings", () => {
    useSettingsStore.setState({ iconWeight: "bold" })
    const { container } = render(<Icon icon={Folder} />)
    expect(svg(container).getAttribute("stroke-width")).toBe("2")
    expect(svg(container).getAttribute("class")).toContain("h-3.5 w-3.5")
  })

  it("falls back to regular for a weight it does not know", () => {
    useSettingsStore.setState({ iconWeight: "heavy" as never })
    const { container } = render(<Icon icon={Folder} />)
    expect(svg(container).getAttribute("stroke-width")).toBe(String(ICON_STROKES.regular))
  })

  it("draws a badge heavier whatever the weight, so it stays legible", () => {
    useSettingsStore.setState({ iconWeight: "thin" })
    const { container } = render(<Icon icon={Folder} size="badge" />)
    expect(svg(container).getAttribute("stroke-width")).toBe("3.5")
  })

  it("names itself when given a label", () => {
    const { getByRole } = render(<Icon icon={Folder} label="Loading" />)
    expect(getByRole("img", { name: "Loading" })).toBeTruthy()
  })
})

/**
 * The standard's gate (docs/icon-standard.md): an icon in FlexTab is drawn
 * only through Icon. A Lucide glyph rendered straight, or a hand-drawn <svg>,
 * brings back the drift this standard removed.
 */
describe("icon standard", () => {
  const SRC = join(__dirname, "../..")
  const files = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return files(path)
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [path] : []
  })
  /** Drawings that are not icons, and how many each file has: brand logos (Google, GitHub, GitLab, Discord), a tooltip's arrow, a progress ring. */
  const NOT_ICONS: Record<string, number> = { "components/OnboardingScreen.tsx": 4, "components/ui/tooltip.tsx": 1, "components/layout/ProfilePanel.tsx": 1 }
  /** Filled indicator dots inside the shadcn primitives are shapes, not stroked icons. */
  const DOTS = /<Circle className="[^"]*fill-current[^"]*" \/>/g

  it("draws no hand-made svg outside logos and non-icon drawings", () => {
    const offenders = files(SRC).filter((f) => !(relative(SRC, f) in NOT_ICONS) && /<svg\b/.test(readFileSync(f, "utf8")))
    expect(offenders.map((f) => relative(SRC, f))).toEqual([])
  })

  it("adds no icon next to the allowed drawings", () => {
    for (const [f, n] of Object.entries(NOT_ICONS)) expect(readFileSync(join(SRC, f), "utf8").match(/<svg\b/g)?.length, f).toBe(n)
  })

  it("renders every Lucide glyph through Icon", () => {
    const offenders: string[] = []
    for (const f of files(SRC)) {
      if (relative(SRC, f) === "components/ui/icon.tsx") continue
      const code = readFileSync(f, "utf8").replace(DOTS, "")
      const imported = code.match(/import \{([^}]*)\} from "lucide-react"/)?.[1]
      if (!imported) continue
      const names = imported.split(",").map((n) => n.replace(/^\s*type\s+/, "").trim()).filter((n) => n && !/^type /.test(n))
      for (const n of names) if (new RegExp(`<${n}[\\s/>]`).test(code)) offenders.push(`${relative(SRC, f)}: <${n}>`)
    }
    expect(offenders).toEqual([])
  })
})
