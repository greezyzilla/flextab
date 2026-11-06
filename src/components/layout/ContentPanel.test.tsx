import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { DndContext } from "@dnd-kit/core"
import { ContentPanel } from "./ContentPanel"
import { TooltipProvider } from "~src/components/ui/tooltip"
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore"
import * as yjs from "~src/lib/yjsDoc"

vi.mock("~src/components/ui/sonner", () => ({ showUndoToast: vi.fn() }))

beforeEach(async () => {
  await yjs.clearState()
  yjs.setSpaces([{ id: "s", name: "Work", order: 0, projects: [] }])
  useSavedSpacesStore.setState({ savedSpaces: yjs.getSpaces(), activeSpaceId: "s", activeProjectId: null, activeCategoryId: null, expandedProjectIds: [] })
})

const setup = () => {
  render(<TooltipProvider><DndContext><ContentPanel /></DndContext></TooltipProvider>)
  return userEvent.setup()
}

describe("empty states create in place", () => {
  it("names a project right where the button was, with no chained category prompt", async () => {
    const user = setup()
    expect(screen.getByText("Work has no projects yet")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "New project…" }))
    await user.keyboard("Trip to Bali{Enter}")
    expect(await screen.findByText("Trip to Bali has no categories yet")).toBeInTheDocument()
    expect(screen.queryByRole("textbox", { name: "New category name" })).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "New category…" }))
    await user.keyboard("Flights{Enter}")
    const project = yjs.getSpaces()[0].projects[0]
    expect(project.name).toBe("Trip to Bali")
    expect(project.categories.map(c => c.name)).toEqual(["Flights"])
  })

  it("Escape or an empty name puts the button back without creating anything", async () => {
    const user = setup()
    await user.click(screen.getByRole("button", { name: "New project…" }))
    await user.keyboard("{Escape}")
    expect(screen.getByRole("button", { name: "New project…" })).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "New project…" }))
    await user.keyboard("   {Enter}")
    expect(yjs.getSpaces()[0].projects).toEqual([])
  })

  it("shows Unsorted first, as a fixed group without rename or delete", async () => {
    yjs.setSpaces([{ id: "s", name: "Work", order: 0, projects: [{ id: "p", name: "Site", order: 0, categories: [
      { id: "c", name: "Research", order: 0, groups: [
        { id: "g", name: "Reading", order: 0, tabs: [{ id: "t1", url: "https://a.com", title: "A", favicon: "", order: 0 }] },
        { id: "u", name: "Unsorted", order: -1, config: { kind: "unsorted" }, tabs: [{ id: "t2", url: "https://b.com", title: "B", favicon: "", order: 0 }] },
      ] },
    ] }] }])
    useSavedSpacesStore.setState({ savedSpaces: yjs.getSpaces(), activeSpaceId: "s", activeProjectId: "p", activeCategoryId: "c", expandedProjectIds: ["p"] })
    setup()
    const headings = screen.getAllByText(/^(Unsorted|Reading)$/).map(el => el.textContent)
    expect(headings).toEqual(["Unsorted", "Reading"])
    expect(screen.getByText("1 tab · not in a group yet")).toBeInTheDocument()
    expect(screen.getByText("1 group")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Delete Unsorted|Rename Unsorted/i })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Delete Reading/i })).toBeInTheDocument()
  })
})
