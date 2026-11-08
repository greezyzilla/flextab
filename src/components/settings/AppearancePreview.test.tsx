import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, render, screen } from "@testing-library/react"
import { AppearancePreview } from "./AppearancePreview"
import { setSpaces } from "~src/lib/yjsDoc"
import { syncActiveSelection } from "~src/store/useSavedSpacesStore"
import { APPEARANCE_DEFAULTS, useSettingsStore } from "~src/store/useSettingsStore"

vi.mock("~src/components/ui/sonner", () => ({ showUndoToast: vi.fn() }))

beforeEach(() => {
  useSettingsStore.setState({ ...APPEARANCE_DEFAULTS })
  // An empty account: the preview must not depend on the person's data.
  setSpaces([])
  syncActiveSelection(true)
})

const preview = () => screen.getByRole("region", { name: "Preview" })
// jsdom drops the grid's computed template; the column count is checked in real
// Chrome (tools/ui-shots/tk30d.cjs). Here: the layout switches live.
const grid = () => preview().querySelector<HTMLElement>(".grid")

describe("AppearancePreview (TASK-30)", () => {
  it("shows the fixed sample to an empty account: the workspace in miniature", () => {
    render(<AppearancePreview />)
    expect(preview().querySelector("input[placeholder='Search tabs, groups and spaces']")).not.toBeNull()
    expect(preview()).toHaveTextContent("Save all tabs")
    expect(preview()).toHaveTextContent("Reading")
    expect(preview()).toHaveTextContent("Inbox")
    expect(preview()).toHaveTextContent("Research")
    expect(preview()).toHaveTextContent("2 tabs") // a list shows two whole rows
  })

  it("shows no header actions: nothing that looks clickable where nothing can be done", () => {
    render(<AppearancePreview />)
    expect(screen.queryByRole("button", { name: /Open all tabs in/, hidden: true })).toBeNull()
    expect(screen.queryByRole("button", { name: /^Actions for Research$/, hidden: true })).toBeNull()
  })

  it("is inert: no tab stops and nothing to act on", () => {
    render(<AppearancePreview />)
    const sample = preview().querySelector("[inert]")
    expect(sample).not.toBeNull()
    const reachable = [...preview().querySelectorAll<HTMLElement>("button, a[href], input, [tabindex]")]
      .filter((el) => el.tabIndex >= 0)
    expect(reachable.length).toBeGreaterThan(0) // the real group controls are there…
    expect(reachable.every((el) => el.closest("[inert]") === sample)).toBe(true) // …all inside the inert sample
  })

  it("follows the layout settings live and returns to the defaults on reset", async () => {
    render(<AppearancePreview />)
    expect(grid()).toBeNull() // list by default
    await act(async () => { useSettingsStore.setState({ groupLayout: "grid", gridColumns: 4 }) })
    expect(grid()).not.toBeNull()
    await act(async () => { useSettingsStore.getState().resetAppearance() })
    expect(grid()).toBeNull()
  })

  it("is a bounded card labelled Preview", () => {
    render(<AppearancePreview />)
    expect(preview().className).toContain("rounded-xl border")
    expect(preview()).toHaveTextContent(/^Preview/)
  })
})
