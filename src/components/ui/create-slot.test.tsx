import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { CreateSlot } from "./create-slot"

const set = (s: string) => s.split(/\s+/).filter(Boolean).sort()

describe("CreateSlot (TASK-103.4)", () => {
  // The exact classes each slot carried at its call site before it moved here, so moving it changed nothing.
  const BEFORE = {
    sidebar: "w-full flex items-center gap-2 rounded-md border border-dashed border-ink/15 pl-[23px] pr-[7px] py-[5px] text-left text-item font-sans text-fg-subtle hover:border-ink/35 hover:bg-ink/[0.03] hover:text-fg transition-colors outline-none focus-visible:ring-1 focus-visible:ring-ring",
    dialog: "flex w-full items-center gap-2 rounded-md border border-dashed border-ink/15 px-[7px] py-[3px] text-left text-xs text-fg-subtle transition-colors hover:border-ink/35 hover:bg-ink/[0.03] hover:text-fg outline-none focus-visible:ring-1 focus-visible:ring-ring",
    panel: "flex min-h-9 w-full items-center gap-3 rounded-[10px] border border-dashed border-ink/15 px-[7px] text-left text-popup text-fg-subtle transition-colors hover:border-ink/35 hover:bg-ink/[0.03] hover:text-fg outline-none focus-visible:ring-2 focus-visible:ring-ring",
  } as const

  for (const size of ["sidebar", "dialog", "panel"] as const) {
    it(`draws the ${size} slot exactly as its call site did`, () => {
      render(<CreateSlot size={size}>New project</CreateSlot>)
      const button = screen.getByRole("button", { name: "New project…" })
      expect(set(button.className)).toEqual(set(BEFORE[size]))
      expect(button.querySelector("span.truncate")?.textContent).toBe("New project…")
    })
  }

  it("takes the + at the size of the items it creates", () => {
    render(<CreateSlot iconSize="xs">New group</CreateSlot>)
    expect(screen.getByRole("button").querySelector("svg")?.getAttribute("class")).toContain("h-3 w-3")
  })
})
