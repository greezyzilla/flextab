import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { DndContext } from "@dnd-kit/core"
import { LeftPanel } from "./LeftPanel"
import { TooltipProvider } from "~src/components/ui/tooltip"
import { stubResizeObserver } from "~src/test/stubResizeObserver"
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore"
import { useUIStore } from "~src/store/useUIStore"
import { showUndoToast } from "~src/components/ui/sonner"
import * as yjs from "~src/lib/yjsDoc"
import { useContainerPreview } from "~src/store/useContainerPreview"
import { act } from "@testing-library/react"

// Tooltips open in these tests; their arrow needs a ResizeObserver (TASK-69).
stubResizeObserver()

vi.mock("~src/components/ui/sonner", () => ({ showUndoToast: vi.fn() }))

beforeEach(async () => {
  vi.clearAllMocks()
  await yjs.clearState()
  yjs.setSpaces([
    { id: "h", name: "Hobby", order: 0, projects: [
      { id: "p1", name: "Test", order: 0, categories: [{ id: "c1", name: "Music", order: 0, groups: [] }] },
      { id: "p2", name: "Games", order: 1, categories: [] },
    ] },
    { id: "e", name: "Personal", order: 1, projects: [{ id: "p3", name: "Home", order: 0, categories: [] }] },
    { id: "b", name: "Business", order: 2, projects: [] },
  ])
  useSavedSpacesStore.setState({ savedSpaces: yjs.getSpaces(), activeSpaceId: "h", activeProjectId: "p1", activeCategoryId: "c1", expandedProjectIds: ["p1"] })
  useUIStore.setState({ creating: null })
})

const setup = () => {
  render(<TooltipProvider><DndContext><LeftPanel /></DndContext></TooltipProvider>)
  return userEvent.setup()
}
const projectsIn = (id: string) => yjs.getSpaces().find((s) => s.id === id)!.projects.map((p) => p.name)

describe("Move to… for projects and categories (TASK-59)", () => {
  it("moves a project to another space from its ⋯ menu, by keyboard, with Undo", async () => {
    const user = setup()
    await user.click(screen.getByRole("button", { name: "Actions for Test" }))
    await user.click(await screen.findByRole("menuitem", { name: "Move to…" }))
    const dialog = await screen.findByRole("dialog", { name: "Move project" })
    expect(dialog).toHaveTextContent("Move “Test” and everything in it to another space.")
    const confirm = within(dialog).getByRole("button", { name: "Move project" })
    expect(within(dialog).getByRole("radio", { name: /Hobby/ })).toBeChecked() // where it is now
    expect(within(dialog).getByText("Current")).toBeInTheDocument()
    expect(confirm).toBeDisabled()
    await user.click(within(dialog).getByRole("radio", { name: /Personal/ }))
    expect(confirm).toBeEnabled()
    await user.click(confirm)
    expect(projectsIn("h")).toEqual(["Games"])
    expect(projectsIn("e")).toEqual(["Home", "Test"])
    expect(showUndoToast).toHaveBeenCalledWith("Moved “Test” to Personal", expect.any(Function))
    vi.mocked(showUndoToast).mock.calls[0][1]()
    expect(projectsIn("h")).toEqual(["Test", "Games"])
  })

  it("moves a category to a project in another space", async () => {
    const user = setup()
    await user.click(screen.getByRole("button", { name: "Actions for Music" }))
    await user.click(await screen.findByRole("menuitem", { name: "Move to…" }))
    const dialog = await screen.findByRole("dialog", { name: "Move category" })
    // Spaces without projects have nothing to pick, so they are left out.
    expect(within(dialog).queryByText("Business")).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole("radio", { name: /Home/ }))
    await user.click(within(dialog).getByRole("button", { name: "Move category" }))
    expect(yjs.getSpaces()[1].projects[0].categories.map((c) => c.name)).toEqual(["Music"])
    expect(yjs.getSpaces()[0].projects[0].categories).toEqual([])
    expect(showUndoToast).toHaveBeenCalledWith("Moved “Music” to Personal › Home", expect.any(Function))
  })

  it("finds a destination by name, keeping a matching space's projects", async () => {
    const user = setup()
    await user.click(screen.getByRole("button", { name: "Actions for Music" }))
    await user.click(await screen.findByRole("menuitem", { name: "Move to…" }))
    const dialog = await screen.findByRole("dialog", { name: "Move category" })
    const find = within(dialog).getByRole("searchbox", { name: "Find a project" })
    await user.type(find, "gam")
    expect(within(dialog).getAllByRole("radio").map((r) => r.closest("label")!.textContent)).toEqual(["Games"])
    await user.clear(find)
    await user.type(find, "personal")
    expect(within(dialog).getAllByRole("radio").map((r) => r.closest("label")!.textContent)).toEqual(["Home"])
    await user.clear(find)
    await user.type(find, "zzz")
    expect(within(dialog).getByText("No match.")).toBeInTheDocument()
  })

  it("gives each project and category row a drag handle on its icon that a plain click ignores", async () => {
    const user = setup()
    const handle = document.querySelector<HTMLElement>('[data-drag-handle="Test"]')!
    expect(handle).toHaveAttribute("aria-hidden", "true")
    expect(document.querySelector('[data-drag-handle="Music"]')).not.toBeNull()
    await user.click(handle)
    expect(useSavedSpacesStore.getState().expandedProjectIds).toEqual(["p1"]) // not toggled
  })

  it("moves a project or category up and down from its ⋯ menu, disabled at either end (TASK-64)", async () => {
    const user = setup()
    await user.click(screen.getByRole("button", { name: "Actions for Test" }))
    expect(await screen.findByRole("menuitem", { name: "Move up" })).toHaveAttribute("data-disabled")
    await user.click(screen.getByRole("menuitem", { name: "Move down" }))
    expect(projectsIn("h")).toEqual(["Games", "Test"])
    await user.click(screen.getByRole("button", { name: "Actions for Test" }))
    expect(await screen.findByRole("menuitem", { name: "Move down" })).toHaveAttribute("data-disabled")
    await user.keyboard("{Escape}")
    await user.click(screen.getByRole("button", { name: "Actions for Music" }))
    expect(await screen.findByRole("menuitem", { name: "Move up" })).toHaveAttribute("data-disabled")
    expect(screen.getByRole("menuitem", { name: "Move down" })).toHaveAttribute("data-disabled") // the only category
    expect(showUndoToast).not.toHaveBeenCalled()
  })

  it("shows the new order while a project is dragged within its space, with no insertion line (TASK-92)", () => {
    setup()
    const shown = () => [...document.querySelectorAll("nav [data-drag-handle]")].map((h) => h.getAttribute("data-drag-handle"))
    expect(shown()).toEqual(["Test", "Music", "Games"])
    act(() => useContainerPreview.getState().show({ kind: "project", id: "p1", next: "p2", edge: "after" }))
    expect(shown()).toEqual(["Games", "Test", "Music"])
    expect(document.querySelector("[data-insert-line]")).toBeNull()
    expect(projectsIn("h")).toEqual(["Test", "Games"]) // nothing moves until the drop
    act(() => useContainerPreview.getState().show(null))
    expect(shown()).toEqual(["Test", "Music", "Games"])
  })

  it("closes without moving anything", async () => {
    const user = setup()
    await user.click(screen.getByRole("button", { name: "Actions for Test" }))
    await user.click(await screen.findByRole("menuitem", { name: "Move to…" }))
    const dialog = await screen.findByRole("dialog", { name: "Move project" })
    await user.type(within(dialog).getByRole("searchbox", { name: "Find a space" }), "bus")
    expect(within(dialog).getAllByRole("radio")).toHaveLength(1)
    await user.keyboard("{Escape}")
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(projectsIn("h")).toEqual(["Test", "Games"])
    expect(showUndoToast).not.toHaveBeenCalled()
  })
})
