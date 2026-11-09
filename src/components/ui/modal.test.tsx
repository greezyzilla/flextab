import { describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { Modal, ModalBody, ModalFooter, ModalHeader, ModalLink, ModalNote, ModalField, ModalGroup, ModalOptionCard, ModalRadio, modalFocusTarget, openerOf } from "./modal"
import { RadioGroup } from "./radio-group"
import { Input } from "./input"

function Harness({ kind = "dialog" as const, dirty = false, dismissible = true, initialFocus = "auto" as const, body = null as React.ReactNode, tone = "primary" as "primary" | "destructive", onPrimary = () => {} }) {
  const [open, setOpen] = useState(true)
  return (
    <>
      <button>trigger</button>
      <Modal kind={kind} size="m" open={open} onOpenChange={setOpen} dirty={dirty} dismissible={dismissible} initialFocus={initialFocus}>
        <ModalHeader title="Do the thing" description="What it does." />
        {body && <ModalBody>{body}</ModalBody>}
        <ModalFooter start={<ModalLink>Help</ModalLink>} primary={{ label: "Do it", tone, onClick: onPrimary }} cancel={dismissible ? "Cancel" : false} />
      </Modal>
      <span data-testid="state">{open ? "open" : "closed"}</span>
    </>
  )
}

const state = () => screen.getByTestId("state").textContent

describe("Modal (TASK-43)", () => {
  it("dialog: role, labelled and described, close X, footer order Cancel then primary", () => {
    render(<Harness />)
    const d = screen.getByRole("dialog", { name: "Do the thing" })
    expect(d).toHaveAccessibleDescription("What it does.")
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument()
    const buttons = [...d.querySelectorAll("[data-modal-cancel], [data-modal-primary]")].map((b) => b.textContent)
    expect(buttons).toEqual(["Cancel", "Do it"])
  })

  it("alert: role alertdialog, no close X", () => {
    render(<Harness kind={"alert" as never} />)
    expect(screen.getByRole("alertdialog", { name: "Do the thing" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument()
  })

  it("Cancel and Escape close; the primary does not close by itself", async () => {
    const onPrimary = vi.fn()
    const user = userEvent.setup()
    render(<Harness onPrimary={onPrimary} />)
    await user.click(screen.getByRole("button", { name: "Do it" }))
    expect(onPrimary).toHaveBeenCalled()
    expect(state()).toBe("open")
    await user.keyboard("{Escape}")
    expect(state()).toBe("closed")
  })

  it("returns focus to what opened it (TASK-43, §8)", async () => {
    function Opener() {
      const [open, setOpen] = useState(false)
      return <>
        <button onClick={() => setOpen(true)}>Open it</button>
        <Modal kind="dialog" size="s" open={open} onOpenChange={setOpen}><ModalHeader title="T" description="D" /></Modal>
      </>
    }
    const user = userEvent.setup()
    render(<Opener />)
    await user.click(screen.getByRole("button", { name: "Open it" }))
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument())
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.getByRole("button", { name: "Open it" })).toHaveFocus())
  })

  it("from a menu item, focus returns to the menu's trigger", () => {
    document.body.innerHTML = `<button id="t">More</button><div role="menu" aria-labelledby="t"><div role="menuitem" tabindex="-1" id="i">Delete</div></div><div role="menu"><div role="menuitem" id="j" tabindex="-1">x</div></div><button id="b">B</button>`
    expect(openerOf(document.getElementById("i"))?.id).toBe("t")
    expect(openerOf(document.getElementById("j"))).toBeNull()
    expect(openerOf(document.getElementById("b"))?.id).toBe("b")
    expect(openerOf(document.body)).toBeNull()
    expect(openerOf(null)).toBeNull()
    document.body.innerHTML = ""
  })

  it("Cancel closes an alert", async () => {
    const user = userEvent.setup()
    render(<Harness kind={"alert" as never} />)
    await user.click(screen.getByRole("button", { name: "Cancel" }))
    expect(state()).toBe("closed")
  })

  it("an outside click closes a clean dialog but not a dirty one", async () => {
    // Radix registers its outside listener a tick after mount.
    // The page behind a modal has pointer-events: none, so skip that check to press it.
    const outside = async () => { await new Promise((r) => setTimeout(r, 10)); await userEvent.setup({ pointerEventsCheck: 0 }).click(screen.getByText("trigger")) }
    const { unmount } = render(<Harness />)
    await outside()
    await waitFor(() => expect(state()).toBe("closed"))
    unmount()
    render(<Harness dirty />)
    await outside()
    await new Promise((r) => setTimeout(r, 50))
    expect(state()).toBe("open")
  })

  it("a forced decision has no Cancel, no close X, and ignores Escape and outside clicks", async () => {
    const user = userEvent.setup()
    render(<Harness dismissible={false} />)
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument()
    await user.keyboard("{Escape}")
    await new Promise((r) => setTimeout(r, 10))
    await userEvent.setup({ pointerEventsCheck: 0 }).click(screen.getByText("trigger"))
    await new Promise((r) => setTimeout(r, 50))
    expect(state()).toBe("open")
  })

  it("focus on open follows the standard's order", async () => {
    // A text field first.
    const { unmount } = render(<Harness body={<ModalField label="Name" htmlFor="n"><Input id="n" /></ModalField>} />)
    await waitFor(() => expect(screen.getByLabelText("Name")).toHaveFocus())
    unmount()
    // An alert without fields: Cancel.
    const a = render(<Harness kind={"alert" as never} />)
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus())
    a.unmount()
    // A dialog with choices: the selected radio.
    const r = render(<Harness body={<RadioGroup defaultValue="b"><ModalRadio id="a" value="a">A</ModalRadio><ModalRadio id="b" value="b" count="2 tabs">B</ModalRadio></RadioGroup>} />)
    await waitFor(() => expect(screen.getByRole("radio", { name: /B/ })).toHaveFocus())
    expect(screen.getByText("· 2 tabs")).toBeInTheDocument()
    r.unmount()
    // A plain dialog: the primary, unless it destroys.
    const p = render(<Harness />)
    await waitFor(() => expect(screen.getByRole("button", { name: "Do it" })).toHaveFocus())
    p.unmount()
    const d = render(<Harness tone="destructive" />)
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus())
    d.unmount()
    // Explicit targets.
    const c = render(<Harness initialFocus={"close" as never} />)
    await waitFor(() => expect(screen.getByRole("button", { name: "Close" })).toHaveFocus())
    c.unmount()
    const pr = render(<Harness kind={"alert" as never} initialFocus={"primary" as never} />)
    await waitFor(() => expect(screen.getByRole("button", { name: "Do it" })).toHaveFocus())
    pr.unmount()
    const cc = render(<Harness initialFocus={"cancel" as never} />)
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus())
    cc.unmount()
    render(<Harness initialFocus={"dialog" as never} />)
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveFocus())
  })

  it("focus target falls back to Cancel, then close, when nothing else fits", () => {
    const root = document.createElement("div")
    root.innerHTML = `<button data-modal-close>x</button>`
    expect(modalFocusTarget(root, "auto", "dialog")?.textContent).toBe("x")
    root.innerHTML = `<button data-modal-cancel>c</button><button data-modal-primary data-modal-tone="destructive">d</button>`
    expect(modalFocusTarget(root, "auto", "dialog")?.textContent).toBe("c")
    root.innerHTML = `<div role="radio" data-state="unchecked">r</div>`
    expect(modalFocusTarget(root, "auto", "dialog")?.textContent).toBe("r")
  })

  it("option cards mark the chosen one, red when the choice destroys", () => {
    render(<Harness body={<ModalGroup label="Choices"><RadioGroup value="b">
      <ModalOptionCard id="oa" value="a" selected={false} title="Add" hint="Beside yours." />
      <ModalOptionCard id="ob" value="b" selected danger title="Replace" hint="Removes yours." aside="5 tabs" />
    </RadioGroup><ModalNote>Small print.</ModalNote></ModalGroup>} />)
    expect(screen.getByText("Replace").closest("label")!.className).toMatch(/red-500/)
    expect(screen.getByText("Add").closest("label")!.className).not.toMatch(/accent-subtle|red-500/)
    expect(screen.getByRole("group", { name: "Choices" })).toBeInTheDocument()
    expect(screen.getByText("Small print.")).toBeInTheDocument()
    expect(screen.getByText("5 tabs")).toBeInTheDocument()
  })
})
