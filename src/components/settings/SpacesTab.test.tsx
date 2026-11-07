import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor, within } from "@testing-library/react"
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

const names = () => within(screen.getByRole("list", { name: "Spaces" })).getAllByRole("listitem").map(li => within(li).getByText(/^(Home|Work)$/).textContent)

describe("Settings › Spaces", () => {
  it("reads the space id from the route", () => {
    expect(spaceIdFromRoute("/settings/spaces/abc")).toBe("abc")
    expect(spaceIdFromRoute("/settings/spaces")).toBeNull()
  })

  it("lists spaces in rail order with what each holds, and reorders them", async () => {
    const user = userEvent.setup()
    render(<SpacesTab />)
    expect(names()).toEqual(["Home", "Work"])
    expect(screen.getByText("1 project · 2 tabs")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Move Home up" })).toBeDisabled()
    await user.click(screen.getByRole("button", { name: "Move Home down" }))
    expect(yjs.getSpaces().map(s => s.name)).toEqual(["Work", "Home"])
  })

  it("edits the selected space's name, abbreviation and color", async () => {
    window.history.replaceState(null, "", "#/settings/spaces/work")
    const user = userEvent.setup()
    render(<SpacesTab />)
    const name = screen.getByLabelText("Name")
    expect(name).toHaveValue("Work")
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled()
    await user.clear(name)
    await user.type(name, "Office")
    await user.type(screen.getByLabelText("Abbreviation (max 2)"), "OFX")
    await user.click(screen.getByRole("button", { name: "Green color" }))
    await user.click(screen.getByRole("button", { name: "Save changes" }))
    expect(yjs.getSpaces()[1]).toMatchObject({ name: "Office", abbreviation: "OF", color: "#22c55e" })
  })

  it("deletes a space only after its name is typed, with undo", async () => {
    const user = userEvent.setup()
    render(<SpacesTab />)
    expect(screen.getByText("Removes 1 project and 2 tabs on every synced device.")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Delete space…" }))
    const confirm = screen.getByRole("button", { name: "Delete space" })
    expect(confirm).toBeDisabled()
    await user.type(screen.getByLabelText(/to confirm/), "Hom")
    expect(confirm).toBeDisabled()
    await user.type(screen.getByLabelText(/to confirm/), "e")
    await user.click(confirm)
    expect(yjs.getSpaces().map(s => s.name)).toEqual(["Work"])
    expect(showUndoToast).toHaveBeenCalledWith('Deleted space "Home"', expect.any(Function))
    await waitFor(() => expect(window.location.hash).toBe("#/settings/spaces"))
  })

  it("never deletes the only space", () => {
    yjs.setSpaces([yjs.getSpaces()[1]])
    useSavedSpacesStore.setState({ savedSpaces: yjs.getSpaces(), activeSpaceId: "work" })
    render(<SpacesTab />)
    expect(screen.getByRole("button", { name: "Delete space…" })).toBeDisabled()
    expect(screen.getByText(/This is your only space/)).toBeInTheDocument()
  })
})
