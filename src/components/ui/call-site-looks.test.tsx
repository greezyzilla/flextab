// Looks that call sites passed in now come from the components, with the same classes.
import { render, screen } from "@testing-library/react"
import { ShieldCheck } from "lucide-react"
import { describe, expect, it } from "vitest"
import { Badge } from "./badge"
import { DoneLine } from "./done-check"
import { IconText } from "./icon-text"
import { Progress } from "./progress"
import { RadioCard } from "./radio-card"
import { RadioGroup } from "./radio-group"
import { ToggleGroup, ToggleGroupItem } from "./toggle-group"

const set = (s: string | null | undefined) => (s ?? "").split(/\s+/).filter(Boolean).sort()

describe("components that took over a call site's look", () => {
  it("RadioCard draws the merge conflict choice card, chosen or not, wide or not", () => {
    render(<RadioGroup layout="grid" value="a"><RadioCard id="a" value="a" selected wide>A</RadioCard><RadioCard id="b" value="b" selected={false}>B</RadioCard></RadioGroup>)
    const [a, b] = [screen.getByText("A").closest("label"), screen.getByText("B").closest("label")]
    const base = "flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2 font-normal transition-colors font-sans text-caption text-fg-subtle leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
    expect(set(a!.className)).toEqual(set(`${base} sm:col-span-2 border-[var(--accent)] bg-[var(--accent-subtle)]`))
    expect(set(b!.className)).toEqual(set(`${base} border-ink/10 bg-ink/[0.02] hover:bg-ink/[0.05]`))
    expect(screen.getAllByRole("radio")[0].getAttribute("class")).toContain("mt-0.5")
    expect(set(screen.getByRole("radiogroup").className)).toEqual(set("grid grid-cols-1 gap-2 sm:grid-cols-2"))
  })
  it("RadioGroup stacks a dialog's list", () => {
    render(<RadioGroup layout="stack" />)
    expect(set(screen.getByRole("radiogroup").className)).toEqual(set("flex flex-col gap-2"))
  })
  it("DoneLine below a line of text keeps 2px from it", () => {
    render(<DoneLine below>Saved</DoneLine>)
    expect(screen.getByRole("status").className).toContain("mt-0.5")
  })
  it("IconText is the sign-in page's privacy line", () => {
    const { container } = render(<IconText icon={ShieldCheck}>We never read or sell your browsing.</IconText>)
    expect(set(container.querySelector("p")!.className)).toEqual(set("flex items-start gap-2 text-fg-subtle text-xs leading-relaxed"))
    expect(set(container.querySelector("svg")!.getAttribute("class")).filter((c) => !c.startsWith("lucide"))).toEqual(set("shrink-0 h-3.5 w-3.5 mt-px text-fg-subtle"))
  })
  it("Progress sm is the 6px usage meter, full width", () => {
    const { container } = render(<Progress value={40} size="sm" />)
    expect(set((container.firstElementChild as HTMLElement).className)).toEqual(set("relative w-full overflow-hidden rounded-full bg-ink/[0.06] h-1.5"))
  })
  it("Badge sm is regular weight", () => {
    render(<Badge size="sm">This device</Badge>)
    expect(screen.getByText("This device").parentElement!.className).toContain("font-normal")
    expect(screen.getByText("This device").parentElement!.className).not.toContain("font-semibold")
  })
  it("ToggleGroup arranges its options at the end or wrapping", () => {
    const { rerender } = render(<ToggleGroup type="single" arrange="end" aria-label="g"><ToggleGroupItem value="a">A</ToggleGroupItem></ToggleGroup>)
    expect(set(screen.getByRole("radiogroup").className)).toEqual(set("flex items-center flex-nowrap justify-end gap-1.5"))
    rerender(<ToggleGroup type="single" arrange="wrap" aria-label="g"><ToggleGroupItem value="a">A</ToggleGroupItem></ToggleGroup>)
    expect(set(screen.getByRole("radiogroup").className)).toEqual(set("flex items-center flex-wrap justify-start gap-1.5"))
  })
})

describe("Skeleton", () => {
  it("paints in the first frame: no element waits before it shows", async () => {
    const { Skeleton, SkeletonRegion } = await import("./skeleton")
    const { container } = render(<SkeletonRegion label="Loading"><Skeleton width={40} height={40} round="full" /><Skeleton line={20} width={80} height={10} /><Skeleton width={10} height={10} /></SkeletonRegion>)
    for (const el of Array.from(container.querySelectorAll<HTMLElement>("*"))) {
      const c = el.getAttribute("class") ?? ""
      expect(/animate-appear|delay-|opacity-0/.test(c), c).toBe(false)
    }
    expect(container.querySelectorAll(".motion-safe\\:animate-pulse")).toHaveLength(3)
  })
})
