import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SpacesTab, spaceIdFromRoute } from "./SpacesTab"
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore"
import { showUndoToast } from "~src/components/ui/sonner"
import * as yjs from "~src/lib/yjsDoc"

vi.mock("~src/components/ui/sonner", () => ({ showUndoToast: vi.fn() }))

const tab = (url: string) => ({ id: url, url, title: url, favicon: "", order: 0 })

beforeEach(async () => {
  vi.mocked(showUndoToast).mockClear()
  await yjs.clearState()
  yjs.setSpaces([
    { id: "home", name: "Home", order: 0, projects: [
      { id: "p1", name: "Site", order: 0, categories: [
        { id: "c1", name: "Research", order: 0, groups: [{ id: "g1", name: "Reading", order: 0, tabs: [tab("https://a.test"), tab("https://b.test")] }] },
      ] },
    ] },
    { id: "work", name: "Work", order: 1, projects: [] },
  ])
  useSavedSpacesStore.setState({ savedSpaces: yjs.getSpaces(), activeSpaceId: "home" })
  window.history.replaceState(null, "", "#/settings/spaces")
})

const names = () => screen.getAllByRole("tab").map(tab => tab.querySelector(".truncate")?.textContent)

describe("Settings › Spaces", () => {
  it("reads the space id from the route", () => {
    expect(spaceIdFromRoute("/settings/spaces/abc")).toBe("abc")
    expect(spaceIdFromRoute("/settings/spaces")).toBeNull()
  })

  it("tabs list the spaces in rail order; the open one's form sits under them and moves it", async () => {
    const user = userEvent.setup()
    render(<SpacesTab />)
    expect(names()).toEqual(["Home", "Work"])
    // The current space opens first, its settings right under the tabs.
    expect(screen.getByRole("tab", { name: "Home" })).toHaveAttribute("aria-selected", "true")
    const panel = screen.getByRole("tabpanel", { name: "Home" })
    expect(within(panel).getByLabelText("Name")).toHaveValue("Home")
    expect(within(panel).getByText("Position 1 of 2 on the rail.")).toBeInTheDocument()
    expect(within(panel).getByRole("button", { name: "Move up" })).toBeDisabled()
    await user.click(within(panel).getByRole("button", { name: "Move down" }))
    expect(yjs.getSpaces().map(s => s.name)).toEqual(["Work", "Home"])
  })

  it("picking a tab edits that space in place; arrow keys move between tabs", async () => {
    const user = userEvent.setup()
    render(<SpacesTab />)
    await user.click(screen.getByRole("tab", { name: "Work" }))
    expect(window.location.hash).toBe("#/settings/spaces/work")
    expect(await screen.findByRole("tabpanel", { name: "Work" })).toBeInTheDocument()
    expect(screen.getByLabelText("Name")).toHaveValue("Work")
    await user.keyboard("{ArrowLeft}")
    await waitFor(() => expect(screen.getByRole("tab", { name: "Home" })).toHaveAttribute("aria-selected", "true"))
    expect(window.location.hash).toBe("#/settings/spaces/home")
    expect(screen.getByLabelText("Name")).toHaveValue("Home")
  })

  it("changes apply as they are made: name and abbreviation on Enter or leaving the field, colour on click", async () => {
    window.history.replaceState(null, "", "#/settings/spaces/work")
    const user = userEvent.setup()
    render(<SpacesTab />)
    const name = screen.getByLabelText("Name")
    expect(name).toHaveValue("Work")
    expect(name).toHaveAttribute("placeholder", "e.g. Work") // TASK-36
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument()
    await user.clear(name)
    await user.type(name, "Office{Enter}")
    expect(yjs.getSpaces()[1].name).toBe("Office")
    expect(screen.getByRole("tab", { name: "Office" })).toBeInTheDocument() // the tab follows at once
    await user.type(screen.getByLabelText("Abbreviation"), "OFX")
    await user.click(screen.getByRole("button", { name: "Green color" })) // leaving the field commits it
    expect(yjs.getSpaces()[1]).toMatchObject({ name: "Office", abbreviation: "OF", color: "#22c55e" })
    await user.click(screen.getByRole("button", { name: "Default color" }))
    expect(yjs.getSpaces()[1].color).toBeUndefined()
    // An emptied name goes back to the saved one.
    await user.clear(name)
    await user.tab()
    expect(name).toHaveValue("Office")
    expect(yjs.getSpaces()[1].name).toBe("Office")
  })

  it("a link to a space that no longer exists opens the current one", async () => {
    window.history.replaceState(null, "", "#/settings/spaces/gone")
    render(<SpacesTab />)
    await waitFor(() => expect(window.location.hash).toBe("#/settings/spaces"))
    expect(screen.getByRole("tab", { name: "Home" })).toHaveAttribute("aria-selected", "true")
  })

  it("deletes a space only after its name is typed, with undo", async () => {
    window.history.replaceState(null, "", "#/settings/spaces/home")
    const user = userEvent.setup()
    render(<SpacesTab />)
    expect(screen.getByText("Removes 1 project and 2 tabs on every synced device.")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Delete space…" }))
    const confirm = screen.getByRole("button", { name: "Delete space" })
    expect(confirm).toBeDisabled()
    // The match is exact, so the placeholder says so; never the name itself (TASK-36).
    expect(screen.getByLabelText(/to confirm/)).toHaveAttribute("placeholder", "Type it exactly as shown")
    await user.type(screen.getByLabelText(/to confirm/), "Hom")
    expect(confirm).toBeDisabled()
    await user.type(screen.getByLabelText(/to confirm/), "e")
    await user.click(confirm)
    expect(yjs.getSpaces().map(s => s.name)).toEqual(["Work"])
    expect(showUndoToast).toHaveBeenCalledWith('Deleted space "Home"', expect.any(Function))
    await waitFor(() => expect(window.location.hash).toBe("#/settings/spaces"))
  })

  it("deletes the only space too, and undo selects it again (TASK-37)", async () => {
    yjs.setSpaces([yjs.getSpaces()[1]])
    useSavedSpacesStore.setState({ savedSpaces: yjs.getSpaces(), activeSpaceId: "work" })
    window.history.replaceState(null, "", "#/settings/spaces/work")
    const user = userEvent.setup()
    render(<SpacesTab />)
    await user.click(screen.getByRole("button", { name: "Delete space…" }))
    await user.type(screen.getByLabelText(/to confirm/), "Work")
    await user.click(screen.getByRole("button", { name: "Delete space" }))
    expect(yjs.getSpaces()).toEqual([])
    expect(useSavedSpacesStore.getState().activeSpaceId).toBeNull()
    expect(await screen.findByText("No spaces yet. Saving a tab creates one.")).toBeInTheDocument()

    const undo = vi.mocked(showUndoToast).mock.calls[0][1] as () => void
    act(() => undo())
    expect(yjs.getSpaces().map(s => s.name)).toEqual(["Work"])
    expect(useSavedSpacesStore.getState().activeSpaceId).toBe("work")
  })

  it("undo after deleting one of several spaces keeps the current selection", async () => {
    window.history.replaceState(null, "", "#/settings/spaces/home")
    const user = userEvent.setup()
    render(<SpacesTab />)
    await user.click(screen.getByRole("button", { name: "Delete space…" }))
    await user.type(screen.getByLabelText(/to confirm/), "Home")
    await user.click(screen.getByRole("button", { name: "Delete space" }))
    expect(useSavedSpacesStore.getState().activeSpaceId).toBe("work")
    act(() => (vi.mocked(showUndoToast).mock.calls[0][1] as () => void)())
    expect(useSavedSpacesStore.getState().activeSpaceId).toBe("work")
  })
})
