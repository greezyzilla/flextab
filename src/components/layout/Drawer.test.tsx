import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { DndContext, useDraggable } from "@dnd-kit/core"
import { Drawer } from "./Drawer"
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "~src/components/ui/dialog"

function Harness({ side = "left" }: { side?: "left" | "right" }) {
  const [open, setOpen] = useState(false)
  return <>
    <button onClick={() => setOpen(true)}>Open panel</button>
    <Drawer side={side} open={open} onClose={() => setOpen(false)}>
      <input aria-label="Panel input" />
      <button>Panel action</button>
      <Dialog>
        <DialogTrigger>Open nested dialog</DialogTrigger>
        <DialogContent><DialogTitle>Nested dialog</DialogTitle><input aria-label="Nested input" /></DialogContent>
      </Dialog>
    </Drawer>
    <button>Background action</button>
  </>
}

describe("drawer keyboard lifecycle", () => {
  it.each(["left", "right"] as const)("keeps the closed %s panel out of the DOM and Tab order", async side => {
    const user = userEvent.setup()
    render(<Harness side={side} />)
    expect(screen.queryByRole("textbox", { name: "Panel input", hidden: true })).not.toBeInTheDocument()
    await user.tab()
    expect(screen.getByRole("button", { name: "Open panel" })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole("button", { name: "Background action" })).toHaveFocus()
  })

  it.each(["left", "right"] as const)("names the %s dialog, traps focus, and restores the opener on Escape", async side => {
    const user = userEvent.setup()
    render(<Harness side={side} />)
    const opener = screen.getByRole("button", { name: "Open panel" })
    await user.click(opener)
    const dialog = screen.getByRole("dialog", { name: side === "left" ? "Navigation" : "Opened tabs" })
    expect(dialog).toHaveAttribute("aria-modal", "true")
    expect(within(dialog).getByRole("button", { name: "Close panel" })).toHaveFocus()
    await user.tab({ shift: true })
    expect(within(dialog).getByRole("button", { name: "Open nested dialog" })).toHaveFocus()
    await user.tab()
    expect(within(dialog).getByRole("button", { name: "Close panel" })).toHaveFocus()
    expect(screen.queryByRole("button", { name: "Background action" })).not.toBeInTheDocument()
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(opener).toHaveFocus()
    await user.tab()
    expect(screen.getByRole("button", { name: "Background action" })).toHaveFocus()
  })

  it("closes with its explicit close button and returns focus", async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const opener = screen.getByRole("button", { name: "Open panel" })
    await user.click(opener)
    await user.click(screen.getByRole("button", { name: "Close panel" }))
    await waitFor(() => expect(opener).toHaveFocus())
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("lets a nested dialog handle Escape before closing the drawer", async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole("button", { name: "Open panel" }))
    await user.click(screen.getByRole("button", { name: "Open nested dialog" }))
    expect(screen.getByRole("dialog", { name: "Nested dialog" })).toBeInTheDocument()
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Nested dialog" })).not.toBeInTheDocument())
    expect(screen.getByRole("dialog", { name: "Navigation" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Open nested dialog" })).toHaveFocus()
  })

  it("keeps inline drawer children connected to the parent drag sensors", async () => {
    function DragItem() {
      const { setNodeRef, attributes, listeners } = useDraggable({ id: "drawer-item" })
      return <button ref={setNodeRef} {...attributes} {...listeners}>Drag item</button>
    }
    const user = userEvent.setup()
    const start = vi.fn(), end = vi.fn()
    const { container } = render(<DndContext onDragStart={start} onDragEnd={end}>
      <Drawer side="right" open onClose={() => {}}><DragItem /></Drawer>
    </DndContext>)
    expect(container).toContainElement(screen.getByRole("dialog"))
    await user.tab()
    expect(screen.getByRole("button", { name: "Drag item" })).toHaveFocus()
    await user.keyboard(" ")
    expect(start).toHaveBeenCalledTimes(1)
    await user.keyboard(" ")
    expect(end).toHaveBeenCalledTimes(1)
  })
})
