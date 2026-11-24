import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { TooltipProvider } from "./tooltip"
import { ShortcutTooltip } from "./kbd"
import { stubResizeObserver } from "~src/test/stubResizeObserver"

stubResizeObserver()

describe("ShortcutTooltip (TASK-119)", () => {
  it("puts the label and its keys in one row with a gap, inside the tooltip's text", async () => {
    render(<TooltipProvider delayDuration={0}><ShortcutTooltip label="New project" shortcut="Shift+N"><button>New project…</button></ShortcutTooltip></TooltipProvider>)
    await userEvent.setup().hover(screen.getByRole("button"))
    const row = (await screen.findAllByText("New project")).map((el) => el.closest('[data-slot="shortcut-tip"]')).find(Boolean)!
    expect(row).toHaveClass("inline-flex", "items-center", "gap-2")
    expect(row.querySelector("kbd")).not.toBeNull()
    expect(row.parentElement).toHaveAttribute("data-tip-text")
  })
})
