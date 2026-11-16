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
    // The header's own search field (TASK-57), not a look-alike.
    const search = preview().querySelector<HTMLInputElement>("[data-search-field] input[aria-label='Search (preview)']")
    expect(search?.placeholder).toMatch(/^Search tabs, groups and spaces… \(/)
    expect(search?.readOnly).toBe(true)
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

  it("shows the Duplicate tabs setting on the sample's duplicate pair, live (TASK-68)", async () => {
    render(<AppearancePreview />)
    const marks = () => [...preview().querySelectorAll<HTMLElement>('[title="This address is in this group more than once"]')]
    // Ribbon by default: one on each copy of the same address.
    expect(marks().map((m) => m.textContent)).toEqual(["DUPE", "DUPE"])
    await act(async () => { useSettingsStore.getState().setDuplicateMark("icon") })
    expect(marks()).toHaveLength(2)
    expect(marks().every((m) => m.textContent === "" && m.querySelector("svg"))).toBe(true)
    await act(async () => { useSettingsStore.getState().setDuplicateMark("off") })
    expect(marks()).toHaveLength(0)
    await act(async () => { useSettingsStore.getState().resetAppearance() })
    expect(marks().map((m) => m.textContent)).toEqual(["DUPE", "DUPE"])
  })

  it("shows the duplicate mark's colour, corner and text choices on the sample (TASK-68)", async () => {
    render(<AppearancePreview />)
    const marks = () => [...preview().querySelectorAll<HTMLElement>('[title="This address is in this group more than once"]')]
    expect(marks().every((m) => m.className.includes("text-caution") && m.className.includes("-right-["))).toBe(true)
    await act(async () => { useSettingsStore.setState({ duplicateTone: "accent", duplicateCorner: "left", duplicateLabel: "count" }) })
    // The sample holds the same address twice, so each ribbon counts 2 copies.
    expect(marks().map((m) => m.textContent)).toEqual(["2×", "2×"])
    expect(marks().every((m) => m.className.includes("text-fg-accent") && m.className.includes("-left-["))).toBe(true)
    await act(async () => { useSettingsStore.setState({ duplicateMark: "icon", duplicateTone: "neutral" }) })
    expect(marks().every((m) => m.className.includes("text-fg-subtle"))).toBe(true)
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
