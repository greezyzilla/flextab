import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { DndContext } from "@dnd-kit/core"
import { LeftPanel } from "./LeftPanel"
import { TooltipProvider } from "~src/components/ui/tooltip"
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore"
import { useUIStore } from "~src/store/useUIStore"
import * as yjs from "~src/lib/yjsDoc"

vi.mock("~src/components/ui/sonner", () => ({ showUndoToast: vi.fn() }))

beforeEach(async () => {
  await yjs.clearState()
  yjs.setSpaces([{ id: "s", name: "Work", order: 0, projects: [
    { id: "p1", name: "Site", order: 0, categories: [
      { id: "c1", name: "Research", order: 0, groups: [] },
      { id: "c2", name: "Design", order: 1, groups: [] },
    ] },
    { id: "p2", name: "Trip", order: 1, categories: [] },
  ] }])
  useSavedSpacesStore.setState({ savedSpaces: yjs.getSpaces(), activeSpaceId: "s", activeProjectId: "p1", activeCategoryId: "c1", expandedProjectIds: [] })
  useUIStore.setState({ creating: null })
})

const setup = () => {
  render(<TooltipProvider><DndContext><LeftPanel /></DndContext></TooltipProvider>)
  return userEvent.setup()
}
const row = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}`) })

describe("sidebar tree by keyboard (TASK-5)", () => {
  it("moves with the arrow keys, expands and collapses projects", async () => {
    const user = setup()
    row("Site").focus()
    await user.keyboard("{ArrowRight}")
    expect(useSavedSpacesStore.getState().expandedProjectIds).toEqual(["p1"])
    await user.keyboard("{ArrowRight}")
    expect(row("Research")).toHaveFocus()
    await user.keyboard("{ArrowDown}")
    expect(row("Design")).toHaveFocus()
    await user.keyboard("{ArrowLeft}")
    expect(row("Site")).toHaveFocus()
    await user.keyboard("{End}")
    expect(row("Trip")).toHaveFocus()
    await user.keyboard("{ArrowUp}{Home}")
    expect(row("Site")).toHaveFocus()
    await user.keyboard("{ArrowLeft}")
    expect(useSavedSpacesStore.getState().expandedProjectIds).toEqual([])
    await user.keyboard("a")
    expect(row("Site")).toHaveFocus()
  })

  it("toggles a project from its name like the chevron (a project is a folder, not a page)", async () => {
    const user = setup()
    // Collapsed Trip: its name opens it and shows its categories.
    await user.click(row("Trip"))
    expect(useSavedSpacesStore.getState().expandedProjectIds).toEqual(["p2"])
    expect(useSavedSpacesStore.getState().activeProjectId).toBe("p2")
    expect(row("Trip")).toHaveAttribute("aria-expanded", "true")
    // Open Trip: its name closes it, and the content panel stays where it is.
    await user.click(row("Trip"))
    expect(useSavedSpacesStore.getState().expandedProjectIds).toEqual([])
    expect(useSavedSpacesStore.getState().activeProjectId).toBe("p2")
    // An open project that is not the current one closes without taking over the content panel.
    useSavedSpacesStore.setState({ expandedProjectIds: ["p1"] })
    await user.click(row("Site"))
    expect(useSavedSpacesStore.getState().expandedProjectIds).toEqual([])
    expect(useSavedSpacesStore.getState().activeProjectId).toBe("p2")
  })

  it("renames a project from its ⋯ menu and keeps focus in the name field", async () => {
    const user = setup()
    await user.click(screen.getByRole("button", { name: "Actions for Site" }))
    await user.click(await screen.findByRole("menuitem", { name: "Rename" }))
    const input = await screen.findByRole("textbox", { name: "Project name" })
    await waitFor(() => expect(input).toHaveFocus())
    await user.clear(input)
    await user.keyboard("Website{Enter}")
    expect(yjs.getSpaces()[0].projects[0].name).toBe("Website")
  })

  it("creates a category from the project's always-visible +, expanding a collapsed project", async () => {
    const user = setup()
    await user.click(screen.getByRole("button", { name: "New category in Site" }))
    expect(useSavedSpacesStore.getState().expandedProjectIds).toEqual(["p1"])
    const input = await screen.findByRole("textbox", { name: "New category name" })
    await waitFor(() => expect(input).toHaveFocus())
    await user.keyboard("Admin{Enter}")
    expect(yjs.getSpaces()[0].projects[0].categories.map((c) => c.name)).toEqual(["Research", "Design", "Admin"])
  })
})
