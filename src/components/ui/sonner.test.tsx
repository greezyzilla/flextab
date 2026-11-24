import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { act, render, screen } from "@testing-library/react"
import { toast } from "sonner"
import { Toaster, showUndoToast } from "./sonner"
import { useSettingsStore } from "~src/store/useSettingsStore"

// jsdom has no matchMedia; sonner reads it for theme="system".
beforeAll(() => vi.stubGlobal("matchMedia", (query: string) => ({
  matches: false, media: query, onchange: null,
  addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
})))

afterEach(() => { act(() => toast.dismiss()); useSettingsStore.setState({ theme: "system" }) })

describe("Toaster", () => {
  it.each(["light", "dark", "system"] as const)("follows the app's %s mode", async (mode) => {
    useSettingsStore.setState({ theme: mode })
    render(<Toaster />)
    act(() => { toast("Hello") })
    await screen.findByText("Hello")
    expect(document.querySelector("[data-sonner-toaster]")).toHaveAttribute("data-sonner-theme", mode === "system" ? expect.stringMatching(/light|dark/) : mode)
  })

  it("colours the description and the action from the theme tokens", async () => {
    render(<Toaster />)
    act(() => showUndoToast("Deleted group", () => {}, 5000, "It had 3 tabs."))
    expect((await screen.findByText("It had 3 tabs.")).closest("[data-description]")).toHaveClass("!text-fg-muted")
    const undo = screen.getByRole("button", { name: "Undo" })
    expect(undo).toHaveClass("!text-fg-accent", "!bg-transparent")
  })
})
