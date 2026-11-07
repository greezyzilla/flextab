import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { ShortcutsDialog } from "./ShortcutsDialog"
import { useUIStore } from "~src/store/useUIStore"

beforeEach(() => {
  Object.assign(chrome, { commands: { getAll: vi.fn(async () => [
    { name: "save-page", shortcut: "Alt+Shift+S" },
    { name: "save-window", shortcut: "" },
    { name: "_execute_action", shortcut: "Alt+F" },
  ]) } })
  useUIStore.setState({ shortcutsOpen: true })
})

describe("ShortcutsDialog (TASK-13)", () => {
  it("lists the page's letters and the commands as Chrome has them set now", async () => {
    render(<ShortcutsDialog />)
    const dialog = screen.getByRole("dialog", { name: "Keyboard shortcuts" })
    const page = within(dialog).getByRole("region", { name: "In FlexTab" })
    expect(page).toHaveTextContent("New group in this category")
    expect(page).toHaveTextContent("Search saved tabs")
    expect(page).not.toHaveTextContent("Show these shortcuts") // you are already in it
    const anywhere = within(dialog).getByRole("region", { name: "Anywhere in Chrome" })
    expect(await within(anywhere).findByText("Save this page")).toBeInTheDocument()
    expect(anywhere).toHaveTextContent("Not set") // save-window was cleared in Chrome
    expect(anywhere).not.toHaveTextContent("Alt+F") // only our own commands
    fireEvent.click(within(dialog).getByRole("button", { name: "Change the Chrome shortcuts" }))
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: "chrome://extensions/shortcuts" })
  })

  it("closes back to the page", () => {
    render(<ShortcutsDialog />)
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
    expect(useUIStore.getState().shortcutsOpen).toBe(false)
  })
})
