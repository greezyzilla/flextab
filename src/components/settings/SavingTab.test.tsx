import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SavingTab } from "./SavingTab"

let disk: Record<string, unknown>
beforeEach(() => {
  disk = { flextab_close_after_save: true }
  vi.mocked(chrome.storage.local.get).mockImplementation((async (key: string) => (key in disk ? { [key]: disk[key] } : {})) as never)
  vi.mocked(chrome.storage.local.set).mockImplementation((async (items: Record<string, unknown>) => { Object.assign(disk, items) }) as never)
})

describe("Settings › Saving (TASK-60)", () => {
  it("shows one switch per way of saving, reads what's stored, and saves a change", async () => {
    const user = userEvent.setup()
    render(<SavingTab />)
    expect(screen.getByText("Saving & closing")).toBeInTheDocument()
    const sw = (name: string) => screen.getByRole("switch", { name })
    await waitFor(() => expect(sw("Close after Save all tabs")).toBeChecked())
    // The window shortcut followed Save all's switch until it has its own.
    expect(sw("Close after saving a window")).toBeChecked()
    expect(sw("Close after dragging a tab in")).not.toBeChecked()
    expect(sw("Close after saving from the popup")).not.toBeChecked()
    await user.click(sw("Close after dragging a tab in"))
    expect(sw("Close after dragging a tab in")).toBeChecked()
    expect(disk.flextab_close_after_drag).toBe(true)
    await user.click(sw("Close after saving a window"))
    expect(disk.flextab_close_after_window).toBe(false)
  })
})
