// TASK-103.4 batches A and B: the row controls moved into components/ui keep the classes their call sites had.
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { BreadcrumbItem } from "./breadcrumb-item"
import { Disclosure } from "./disclosure"
import { DragHandle } from "./drag-handle"
import { TextLink } from "./text-link"
import { TreeRowButton } from "./tree-row-button"
import { RowOverlay } from "./row-overlay"
import { ActionList, ActionRow } from "./action-row"
import { Plus } from "lucide-react"

const set = (s: string) => s.split(/\s+/).filter(Boolean).sort()
const button = () => screen.getByRole("button")

describe("Disclosure", () => {
  const PANEL = "flex min-h-[38px] w-full min-w-0 items-center pr-3 text-left outline-none transition-colors hover:bg-ink/[0.04] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
  const LEVEL = { space: "text-popup-meta text-fg-subtle", project: "text-popup font-medium text-fg-muted", category: "text-popup text-fg-muted" } as const
  for (const level of ["space", "project", "category"] as const) {
    it(`draws a ${level} branch of the panel tree as DestinationPicker did`, () => {
      render(<Disclosure size="panel" level={level} open={false}>x</Disclosure>)
      expect(set(button().className)).toEqual(set(`${PANEL} ${LEVEL[level]}`))
      expect(button().firstElementChild?.getAttribute("class")).toBe("mr-1 flex w-5 shrink-0 justify-center text-fg-subtle")
    })
  }
  it("draws a dialog row as WorkspaceTree did, chevron subtle", () => {
    render(<Disclosure size="row" open>x</Disclosure>)
    expect(set(button().className)).toEqual(set("flex w-full min-w-0 items-center gap-2 rounded-md px-1 py-1 text-left outline-none hover:bg-ink/[0.04] focus-visible:ring-1 focus-visible:ring-ring"))
    expect(button().querySelector("svg")?.getAttribute("class")).toContain("text-fg-subtle")
  })
  it("draws the inline one as the conflict dialog did, chevron in the text colour", () => {
    render(<Disclosure size="inline" open={false}>3 other changes</Disclosure>)
    expect(set(button().className)).toEqual(set("flex items-center gap-1.5 rounded text-fg-muted text-xs outline-none hover:text-fg focus-visible:ring-1 focus-visible:ring-ring"))
    expect(button().querySelector("svg")?.getAttribute("class")).not.toContain("text-fg")
  })
  it("announces and turns with its state", () => {
    const { rerender } = render(<Disclosure open={false}>x</Disclosure>)
    expect(button()).toHaveAttribute("aria-expanded", "false")
    expect(button().querySelector("svg")?.getAttribute("class")).not.toContain("rotate-90")
    rerender(<Disclosure open>x</Disclosure>)
    expect(button()).toHaveAttribute("aria-expanded", "true")
    expect(button().querySelector("svg")?.getAttribute("class")).toContain("rotate-90")
  })
})

describe("DragHandle", () => {
  const OPENED_TABS = "peer pointer-events-auto absolute -inset-0.5 z-10 flex items-center justify-center rounded opacity-0 group-hover/tab:opacity-100 focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-ring outline-none cursor-grab active:cursor-grabbing transition-opacity"
  it("is the Opened tabs grip exactly", () => {
    render(<DragHandle reveal="group-hover/tab:opacity-100" aria-label="Drag a" />)
    expect(set(button().className)).toEqual(set(OPENED_TABS))
  })
  it("adds the panel fill under the grip when the favicon stays drawn (a group's tab)", () => {
    render(<DragHandle cover reveal="group-hover:opacity-100" aria-label="Reorder a" />)
    // The group's grip had no peer/z-10/pointer-events-auto; they change nothing there (no later sibling, no pointer-events-none parent).
    expect(set(button().className)).toEqual(set(OPENED_TABS.replace("group-hover/tab:opacity-100", "group-hover:opacity-100") + " bg-black-800"))
  })
})

describe("BreadcrumbItem", () => {
  it("draws a step above the current one as the content panel did", () => {
    render(<BreadcrumbItem>Launch</BreadcrumbItem>)
    expect(set(button().className)).toEqual(set("flex items-center gap-1.5 min-w-0 rounded px-1 -mx-1 text-fg hover:text-ink outline-none focus-visible:ring-1 focus-visible:ring-ring"))
    expect(button()).not.toHaveAttribute("aria-current")
  })
  it("draws and announces the current step", () => {
    render(<BreadcrumbItem current>Research</BreadcrumbItem>)
    expect(set(button().className)).toEqual(set("flex items-center gap-1.5 min-w-0 rounded px-1 -mx-1 text-fg-muted hover:text-fg outline-none focus-visible:ring-1 focus-visible:ring-ring"))
    expect(button()).toHaveAttribute("aria-current", "location")
  })
})

describe("TextLink without an underline", () => {
  it("is a group's name as TabGroup drew it (plus the shared disabled look)", () => {
    render(<TextLink underline={false} truncate>Competitors</TextLink>)
    expect(set(button().className)).toEqual(set("block max-w-full text-left truncate rounded outline-none focus-visible:ring-1 focus-visible:ring-ring hover:text-fg transition-colors disabled:opacity-50"))
  })
  it("is a list's '+3 more' as WorkspaceTree drew it (plus the shared colour fade and disabled look)", () => {
    render(<TextLink tone="muted" size="2xs" underline={false}>+3 more</TextLink>)
    expect(set(button().className)).toEqual(set("text-fg-muted hover:text-fg rounded text-caption outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors disabled:opacity-50"))
  })
  it("keeps the underline by default", () => {
    render(<TextLink>Forgot password?</TextLink>)
    expect(button().className).toContain("underline underline-offset-4")
  })
})

describe("TreeRowButton", () => {
  it("draws a project label as LeftPanel did (PANEL_ROW_LABEL, name PANEL_ROW_TEXT)", () => {
    render(<TreeRowButton level="project" className="flex-1 min-w-0" icon={<i data-testid="icon" />}>Launch</TreeRowButton>)
    expect(set(button().className)).toEqual(set("flex-1 min-w-0 flex items-center gap-2 py-1.5 text-left rounded outline-none focus-visible:ring-1 focus-visible:ring-ring"))
    expect(button().firstElementChild).toBe(screen.getByTestId("icon"))
    expect(screen.getByText("Launch").getAttribute("class")).toBe("flex-1 font-sans text-item font-medium truncate")
  })
  it("draws a category label as LeftPanel did", () => {
    render(<TreeRowButton level="category" className="flex-1 min-w-0" icon={null}>Research</TreeRowButton>)
    expect(set(button().className)).toEqual(set("flex-1 min-w-0 flex items-center gap-2 pl-7 pr-1 py-1.5 rounded-md text-left outline-none focus-visible:ring-1 focus-visible:ring-ring"))
    expect(screen.getByText("Research").getAttribute("class")).toBe("flex-1 font-sans text-item truncate")
  })
  it("is a plain button that passes its state and data through", () => {
    render(<TreeRowButton level="project" icon={null} aria-expanded aria-current="page" data-tree-row="project">Launch</TreeRowButton>)
    expect(button()).toHaveAttribute("type", "button")
    expect(button()).toHaveAttribute("aria-expanded", "true")
    expect(button()).toHaveAttribute("aria-current", "page")
    expect(button()).toHaveAttribute("data-tree-row", "project")
    expect(button()).toHaveAccessibleName("Launch")
  })
})

describe("RowOverlay", () => {
  it("covers its row as RightPanel's Go to did", () => {
    render(<RowOverlay aria-label="Go to Docs" />)
    expect(set(screen.getByRole("button", { name: "Go to Docs" }).className)).toEqual(set("absolute inset-0 rounded-md cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-ring"))
    expect(button()).toHaveAttribute("type", "button")
  })
})

describe("ActionList and ActionRow", () => {
  const ROW = "grid min-h-11 w-full grid-cols-[20px_minmax(0,1fr)] items-center gap-x-3 px-3 py-[11px] text-left text-popup text-fg outline-none transition-colors [overflow-wrap:anywhere] [&+&]:border-t [&+&]:border-ink/[0.07] hover:bg-ink/[0.05] focus-visible:bg-ink/[0.07] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-50"
  it("draws the popup's Steps box and rows as the popup did", () => {
    const { container } = render(<ActionList><ActionRow icon={Plus}>Save to a group</ActionRow><ActionRow icon={Plus} expanded>Undo</ActionRow></ActionList>)
    expect(set((container.firstElementChild as HTMLElement).className)).toEqual(set("overflow-hidden rounded-popup bg-ink/[0.04]"))
    const [rest, open] = screen.getAllByRole("button")
    expect(set(rest.className)).toEqual(set(ROW))
    expect(set(open.className)).toEqual(set(`${ROW} bg-ink/[0.07]`))
    expect(rest.querySelector("svg")?.getAttribute("class")).toContain("text-fg-muted")
    expect(screen.getByText("Save to a group").getAttribute("class")).toBe("[text-wrap:pretty]")
  })
  it("announces expanded only when the row opens something, and keeps disabled and name", () => {
    render(<ActionList><ActionRow icon={Plus}>Open</ActionRow><ActionRow icon={Plus} expanded={false} disabled aria-label="Save this page to a group">Save</ActionRow></ActionList>)
    const [plain, picker] = screen.getAllByRole("button")
    expect(plain).not.toHaveAttribute("aria-expanded")
    expect(picker).toHaveAttribute("aria-expanded", "false")
    expect(picker).toBeDisabled()
    expect(picker).toHaveAccessibleName("Save this page to a group")
  })
})
