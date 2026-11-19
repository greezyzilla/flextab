import { beforeEach, describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { EmptyWorkspace, RING, STARTERS, ringOpacity } from "./EmptyWorkspace"
import { SPACE_COLORS } from "~src/components/settings/SpacesTab"
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore"
import * as yjs from "~src/lib/yjsDoc"

beforeEach(async () => {
  await yjs.clearState()
  yjs.setSpaces([])
  useSavedSpacesStore.setState({ savedSpaces: [], activeSpaceId: null, activeProjectId: null, activeCategoryId: null })
})

const setup = (request = 0) => {
  const view = render(<EmptyWorkspace request={request} />)
  return { user: userEvent.setup(), ...view }
}
const field = () => screen.getByRole("textbox", { name: "New space name" })
const state = () => useSavedSpacesStore.getState()

describe("clean slate (TASK-98)", () => {
  it("each starter creates its space in its palette colour and opens it on General › Uncategorized", async () => {
    const { user } = setup()
    for (const s of STARTERS) expect(SPACE_COLORS).toContain(s.color)
    await user.click(screen.getByRole("button", { name: "Study" }))
    const [space] = yjs.getSpaces()
    expect(space).toMatchObject({ name: "Study", color: "#22c55e" })
    expect(space.projects[0]).toMatchObject({ name: "General", categories: [expect.objectContaining({ name: "Uncategorized", groups: [] })] })
    expect(state().activeSpaceId).toBe(space.id)
    expect(state().activeCategoryId).toBe(space.projects[0].categories[0].id)
  })

  it("Create and Enter use the typed name, trimmed, in the default colour; a blank name creates nothing", async () => {
    const { user } = setup()
    await user.click(screen.getByRole("button", { name: "Create" }))
    await user.click(field())
    await user.keyboard("   {Enter}")
    expect(yjs.getSpaces()).toHaveLength(0)
    await user.keyboard("  Atelier  ")
    await user.click(screen.getByRole("button", { name: "Create" }))
    expect(yjs.getSpaces()).toEqual([expect.objectContaining({ name: "Atelier" })])
    expect("color" in yjs.getSpaces()[0]).toBe(false)
  })

  it("Escape clears the field and creates nothing; Enter/Escape is read, not printed", async () => {
    const { user } = setup()
    await user.click(field())
    await user.keyboard("Draft{Escape}")
    expect(field()).toHaveValue("")
    expect(yjs.getSpaces()).toHaveLength(0)
    expect(field()).toHaveAttribute("aria-description", "Enter to create, Escape to cancel")
  })

  it("focuses the field only when Alt+N asked for it", () => {
    const { rerender } = setup(0)
    expect(field()).not.toHaveFocus()
    rerender(<EmptyWorkspace request={1} />)
    expect(field()).toHaveFocus()
  })

  it("keeps the loose tabs out of reach: inert, hidden from screen readers, the middle row only on wide stages", () => {
    setup()
    const layer = screen.getByTestId("loose-tabs")
    expect(layer).toHaveAttribute("aria-hidden", "true")
    expect(layer).toHaveAttribute("inert")
    const spans = Array.from(layer.children) as HTMLElement[]
    expect(spans).toHaveLength(RING.length)
    expect(spans.filter(s => s.className.includes("max-xl:hidden")).map(s => s.textContent)).toEqual([expect.stringContaining("Sprint board"), expect.stringContaining("Q4 planning")])
    expect(screen.queryByRole("button", { name: /Pull request/ })).toBeNull()
  })

  it("fades each tab as a whole, more the further from the middle, never below 0.3", () => {
    expect(ringOpacity({ left: 42, top: 48 })).toBe(1)
    expect(ringOpacity({ left: 92, top: 98 })).toBe(0.3)
    const values = RING.map(ringOpacity)
    for (const v of values) { expect(v).toBeGreaterThanOrEqual(0.3); expect(v).toBeLessThanOrEqual(1) }
    expect(ringOpacity(RING[0])).toBeLessThan(ringOpacity(RING[6]))
  })
})
