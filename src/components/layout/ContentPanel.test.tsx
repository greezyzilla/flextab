import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { DndContext } from "@dnd-kit/core"
import { ContentPanel } from "./ContentPanel"
import { TooltipProvider } from "~src/components/ui/tooltip"
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore"
import { useUIStore } from "~src/store/useUIStore"
import { useSettingsStore } from "~src/store/useSettingsStore"
import * as yjs from "~src/lib/yjsDoc"

vi.mock("~src/components/ui/sonner", () => ({ showUndoToast: vi.fn() }))

beforeEach(async () => {
  await yjs.clearState()
  yjs.setSpaces([{ id: "s", name: "Work", order: 0, projects: [] }])
  useSavedSpacesStore.setState({ savedSpaces: yjs.getSpaces(), activeSpaceId: "s", activeProjectId: null, activeCategoryId: null, expandedProjectIds: [] })
  useUIStore.setState({ namingGroupIn: null })
})

const setup = () => {
  render(<TooltipProvider><DndContext><ContentPanel /></DndContext></TooltipProvider>)
  return userEvent.setup()
}

describe("empty states create in place", () => {
  it("with no spaces says so and names the first space in place (TASK-37)", async () => {
    yjs.setSpaces([])
    useSavedSpacesStore.setState({ savedSpaces: [], activeSpaceId: null })
    const user = setup()
    expect(screen.getByText("No spaces yet")).toBeInTheDocument()
    expect(screen.queryByText(/Pick one on the left/)).not.toBeInTheDocument()
    expect(screen.queryByRole("navigation", { name: "Location" })).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "New space…" }))
    await user.keyboard("Studio{Enter}")
    expect(await screen.findByText("Studio has no projects yet")).toBeInTheDocument()
    const [space] = yjs.getSpaces()
    expect(space.name).toBe("Studio")
    expect(useSavedSpacesStore.getState().activeSpaceId).toBe(space.id)
  })

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
    expect(screen.getByText("1 tab · drag into a group to file them")).toBeInTheDocument()
    expect(screen.getByText("1 group · 1 unsorted")).toBeInTheDocument()
    // Unsorted is the system's tray: it opens its tabs, but has no ⋯ (never renamed, moved or deleted).
    expect(screen.queryByRole("button", { name: /Actions for Unsorted|Rename Unsorted/i })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Open all tabs in Unsorted" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Actions for Reading" })).toBeInTheDocument()
  })

  const withGroups = () => {
    yjs.setSpaces([{ id: "s", name: "Work", order: 0, projects: [{ id: "p", name: "Site", order: 0, categories: [
      { id: "c", name: "Research", order: 0, groups: [
        { id: "g", name: "Reading", order: 0, tabs: [] },
        { id: "u", name: "Unsorted", order: -1, config: { kind: "unsorted" }, tabs: [{ id: "t2", url: "https://b.com", title: "B", favicon: "", order: 0 }] },
      ] },
    ] }] }])
    useSavedSpacesStore.setState({ savedSpaces: yjs.getSpaces(), activeSpaceId: "s", activeProjectId: "p", activeCategoryId: "c", expandedProjectIds: ["p"] })
  }
  const groupNames = () => yjs.getSpaces()[0].projects[0].categories[0].groups

  it("New group asks for a name first and creates it at the top, below Unsorted", async () => {
    withGroups()
    const user = setup()
    await user.click(screen.getByRole("button", { name: "New group in Research" }))
    expect(groupNames()).toHaveLength(2)
    await user.keyboard("Seasonal{Enter}")
    const created = groupNames().find(g => g.name === "Seasonal")!
    expect(created.order).toBeLessThan(0)
    const headings = screen.getAllByText(/^(Unsorted|Reading|Seasonal)$/).map(el => el.textContent)
    expect(headings).toEqual(["Unsorted", "Seasonal", "Reading"])
    expect(screen.getByText("2 groups · 1 unsorted")).toBeInTheDocument()
  })

  it("Escape or an empty group name creates nothing", async () => {
    withGroups()
    const user = setup()
    await user.click(screen.getByRole("button", { name: "New group in Research" }))
    await user.keyboard("{Escape}")
    expect(screen.queryByRole("textbox", { name: "New group name in Research" })).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "New group in Research" }))
    await user.keyboard("   {Enter}")
    expect(groupNames()).toHaveLength(2)
  })

  it("names the save-page keys as set in Chrome, and says nothing when they were cleared (TASK-13)", async () => {
    vi.mocked(chrome.commands.getAll).mockResolvedValueOnce([{ name: "save-page", shortcut: "" }] as never)
    yjs.setSpaces([{ id: "s", name: "Work", order: 0, projects: [{ id: "p", name: "Site", order: 0, categories: [{ id: "c", name: "Research", order: 0, groups: [] }] }] }])
    useSavedSpacesStore.setState({ savedSpaces: yjs.getSpaces(), activeSpaceId: "s", activeProjectId: "p", activeCategoryId: "c", expandedProjectIds: ["p"] })
    setup()
    expect(await screen.findByText("Drag tabs here from Opened Tabs")).toBeInTheDocument()
    await waitFor(() => expect(chrome.commands.getAll).toHaveBeenCalled())
    expect(screen.queryByText(/on any page to save it/)).not.toBeInTheDocument()
  })

  it("guides a first run from the empty section, with one real save action (TASK-7)", async () => {
    yjs.setSpaces([{ id: "s", name: "Work", order: 0, projects: [{ id: "p", name: "Site", order: 0, categories: [
      { id: "c", name: "Research", order: 0, groups: [] },
      { id: "c2", name: "Design", order: 1, groups: [] },
    ] }] }])
    useSavedSpacesStore.setState({ savedSpaces: yjs.getSpaces(), activeSpaceId: "s", activeProjectId: "p", activeCategoryId: "c", expandedProjectIds: ["p"] })
    const user = setup()
    expect(await screen.findAllByText("Or press Alt+Shift+S on any page to save it.")).toHaveLength(2)
    // [0] is the header's Save all tabs; then one per empty section.
    await user.click(screen.getAllByRole("button", { name: "Save all tabs" })[2])
    expect(useSavedSpacesStore.getState().activeCategoryId).toBe("c2")
    expect(useUIStore.getState().saveAllOpen).toBe(true)
  })

  it("keeps an empty section to one quiet line once the workspace holds tabs", () => {
    yjs.setSpaces([{ id: "s", name: "Work", order: 0, projects: [{ id: "p", name: "Site", order: 0, categories: [
      { id: "c", name: "Research", order: 0, groups: [] },
      { id: "c2", name: "Saved", order: 1, groups: [{ id: "g", name: "G", order: 0, tabs: [{ id: "t", url: "https://a.example", title: "A", favicon: "", order: 0 }] }] },
    ] }] }])
    useSavedSpacesStore.setState({ savedSpaces: yjs.getSpaces(), activeSpaceId: "s", activeProjectId: "p", activeCategoryId: "c", expandedProjectIds: ["p"] })
    setup()
    expect(screen.getByText("No groups yet. Drag tabs here.")).toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: "Save all tabs" })).toHaveLength(1) // the header's only
  })

  it("an empty section's New group opens the name row in place of the drop row", async () => {
    yjs.setSpaces([{ id: "s", name: "Work", order: 0, projects: [{ id: "p", name: "Site", order: 0, categories: [
      { id: "c", name: "Research", order: 0, groups: [] },
    ] }] }])
    useSavedSpacesStore.setState({ savedSpaces: yjs.getSpaces(), activeSpaceId: "s", activeProjectId: "p", activeCategoryId: "c", expandedProjectIds: ["p"] })
    const user = setup()
    expect(screen.getByText("Drag tabs here from Opened Tabs")).toBeInTheDocument()
    expect(screen.queryByText("0 groups")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "New group in Research" }))
    expect(screen.queryByText("Drag tabs here from Opened Tabs")).not.toBeInTheDocument()
    await user.keyboard("Ideas")
    // Focus moves elsewhere in the page (window still focused) → the name commits.
    const hasFocus = vi.spyOn(document, "hasFocus").mockReturnValue(true)
    await user.tab()
    hasFocus.mockRestore()
    expect(groupNames().map(g => [g.name, g.order])).toEqual([["Ideas", 0]])
  })
})

describe("content header tools (TASK-61)", () => {
  it("the List/Grid toggle is one radio group in the segmented tray, and switches the layout", async () => {
    yjs.setSpaces([{ id: "s", name: "Work", order: 0, projects: [{ id: "p", name: "Site", order: 0, categories: [
      { id: "c", name: "Research", order: 0, groups: [
        { id: "g", name: "Reading", order: 0, tabs: [{ id: "t1", url: "https://a.com", title: "A", favicon: "", order: 0 }] },
      ] },
    ] }] }])
    useSavedSpacesStore.setState({ savedSpaces: yjs.getSpaces(), activeSpaceId: "s", activeProjectId: "p", activeCategoryId: "c", expandedProjectIds: ["p"] })
    useSettingsStore.setState({ groupLayout: "list" })
    const user = setup()
    const group = screen.getByRole("radiogroup", { name: "Group layout" })
    expect(group).toHaveClass("h-8", "border")
    const list = screen.getByRole("radio", { name: "List view" }), grid = screen.getByRole("radio", { name: "Grid view" })
    expect(list).toHaveAttribute("aria-checked", "true")
    // The item, not its tooltip, owns data-state: the pressed style keys off "on".
    expect(list).toHaveAttribute("data-state", "on")
    expect(grid).toHaveAttribute("data-state", "off")
    await user.hover(grid)
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Grid view")
    await user.click(grid)
    expect(useSettingsStore.getState().groupLayout).toBe("grid")
    expect(grid).toHaveAttribute("aria-checked", "true")
    expect(grid).toHaveAttribute("data-state", "on")
    // Clicking the chosen one again keeps it chosen (a single choice is never empty).
    await user.click(grid)
    expect(useSettingsStore.getState().groupLayout).toBe("grid")
    expect(screen.getByRole("button", { name: "Save all tabs" })).toHaveClass("h-8")
  })
})
