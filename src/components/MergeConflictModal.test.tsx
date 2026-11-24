import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { MergeConflictModal } from "./MergeConflictModal"
import { useMergeConflict } from "~src/store/useMergeConflict"
import { merge3 } from "~src/services/spacesMerge3"
import { toast } from "sonner"

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }))
import type { SavedSpace, SavedTab } from "~src/types"

const { dismiss, resolve } = vi.hoisted(() => ({ dismiss: vi.fn(), resolve: vi.fn() }))
vi.mock("~src/services/syncEngine", () => ({ dismissMergeConflicts: dismiss, resolveMergeConflicts: resolve }))

const tab = (id: string): SavedTab => ({ id, title: id, url: `https://${id}.example/`, favicon: "" })
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))
// Work › General › Reading › {Inbox, Later}
const base: SavedSpace[] = [{ id: "s", name: "Work", projects: [{ id: "p", name: "General", categories: [{ id: "c", name: "Reading",
  groups: [{ id: "g1", name: "Inbox", tabs: [tab("a"), tab("b")] }, { id: "g2", name: "Later", tabs: [tab("x")] }] }] }] }]

function open() {
  const server = clone(base), local = clone(base)
  server[0].name = "Office"; local[0].name = "Work HQ" // both renamed the space
  const sGroups = server[0].projects[0].categories[0].groups, lGroups = local[0].projects[0].categories[0].groups
  sGroups.splice(1, 1) // the account deleted Later…
  lGroups[1].tabs.push(tab("y"), tab("z")) // …while this device added 2 tabs to it
  sGroups[0].tabs.push(tab("n")) // and the account added a tab to Inbox: merges by itself
  const { conflicts } = merge3(base, server, local)
  useMergeConflict.getState().open(conflicts, base, server, local)
}

beforeEach(() => { vi.clearAllMocks(); useMergeConflict.getState().close() })

describe("MergeConflictModal", () => {
  it("shows each conflict with its type, path, base and both sides", () => {
    open()
    render(<MergeConflictModal />)
    const space = screen.getByRole("region", { name: "Space Work" })
    expect(space).toHaveTextContent("Name was “Work”. Both sides changed it.")
    expect(within(space).getByRole("radio", { name: /This device.*Work HQ/ })).not.toBeChecked()
    expect(within(space).getByRole("radio", { name: /Your account.*Office/ })).not.toBeChecked()
    const group = screen.getByRole("region", { name: "Group Later" })
    expect(group).toHaveTextContent("in Work › General › Reading")
    expect(group).toHaveTextContent("Your account deleted this group. This device added 2 tabs.")
    expect(within(group).getByRole("radio", { name: /Keep it.*this device's changes/ })).toBeInTheDocument()
    expect(within(group).getByRole("radio", { name: /Delete it/ })).toBeInTheDocument()
  })

  it("names group colours as the menu does, and an uncoloured side as None", () => {
    const b = clone(base), server = clone(base), local = clone(base)
    b[0].projects[0].categories[0].groups[0].color = "blue"
    server[0].projects[0].categories[0].groups[0].color = "red"
    delete local[0].projects[0].categories[0].groups[0].color // this device cleared it
    const { conflicts } = merge3(b, server, local)
    useMergeConflict.getState().open(conflicts, b, server, local)
    render(<MergeConflictModal />)
    const group = screen.getByRole("region", { name: "Group Inbox" })
    expect(group).toHaveTextContent("Color was Blue. Both sides changed it.")
    expect(within(group).getByRole("radio", { name: /This device.*None/ })).toBeInTheDocument()
    expect(within(group).getByRole("radio", { name: /Your account.*Red/ })).toBeInTheDocument()
    expect(group).not.toHaveTextContent("“")
  })

  it("asks where a project moved on both sides goes, and says a move survived a delete", () => {
    const at = (spaceId: string | null): SavedSpace[] => ["s", "h", "e"].map((id) => ({
      id, name: { s: "Work", h: "Hobby", e: "Personal" }[id]!,
      projects: id === spaceId ? [{ id: "p2", name: "Test", categories: [] }] : [],
    }))
    let r = merge3(at("s"), at("h"), at("e"))
    useMergeConflict.getState().open(r.conflicts, at("s"), at("h"), at("e"))
    const view = render(<MergeConflictModal />)
    const moved = screen.getByRole("region", { name: "Project Test" })
    expect(moved).toHaveTextContent("Place was “Work”. Both sides changed it.")
    expect(within(moved).getByRole("radio", { name: /This device.*Personal/ })).toBeInTheDocument()
    expect(within(moved).getByRole("radio", { name: /Your account.*Hobby/ })).toBeInTheDocument()
    view.unmount()

    r = merge3(at("s"), at(null), at("e"))
    useMergeConflict.getState().open(r.conflicts, at("s"), at(null), at("e"))
    render(<MergeConflictModal />)
    expect(screen.getByRole("region", { name: "Project Test" })).toHaveTextContent("Your account deleted this project. This device moved it to Personal.")
  })

  it("says a container the other side deleted received a moved item", () => {
    const b: SavedSpace[] = [{ id: "s", name: "Work", projects: [{ id: "p2", name: "Test", categories: [] }] }, { id: "e", name: "Personal", projects: [] }]
    const server: SavedSpace[] = [clone(b[0])] // the account deleted Personal
    const local: SavedSpace[] = [{ ...clone(b[0]), projects: [] }, { id: "e", name: "Personal", projects: [clone(b[0].projects[0])] }]
    const { conflicts } = merge3(b, server, local)
    useMergeConflict.getState().open(conflicts, b, server, local)
    render(<MergeConflictModal />)
    expect(screen.getByRole("region", { name: "Space Personal" })).toHaveTextContent("Your account deleted this space. This device moved “Test” into it.")
  })

  it("chooses nothing for the user: Apply waits for every conflict", () => {
    open()
    render(<MergeConflictModal />)
    const apply = screen.getByRole("button", { name: "Resolve conflicts" })
    expect(apply).toBeDisabled()
    expect(screen.getByText("0 of 2 chosen")).toBeInTheDocument()
    fireEvent.click(within(screen.getByRole("region", { name: "Space Work" })).getByRole("radio", { name: /Your account/ }))
    expect(screen.getByText("1 of 2 chosen")).toBeInTheDocument()
    expect(apply).toBeDisabled()
    fireEvent.click(within(screen.getByRole("region", { name: "Group Later" })).getByRole("radio", { name: /Delete it/ }))
    expect(apply).toBeEnabled()
    expect(screen.getByText("3 tabs after apply")).toBeInTheDocument() // a, b + the account's n
    fireEvent.click(apply)
    const [name, deleted] = useMergeConflict.getState().conflicts.map((c) => c.key)
    expect(resolve).toHaveBeenCalledWith({ [name]: "server", [deleted]: "server" }, [])
  })

  it("chooses one side for every conflict at once", () => {
    open()
    render(<MergeConflictModal />)
    fireEvent.click(screen.getByRole("button", { name: "This device" }))
    expect(screen.getByRole("button", { name: "Resolve conflicts" })).toBeEnabled()
    expect(screen.getByText("6 tabs after apply")).toBeInTheDocument() // a, b, n + Later's x, y, z
  })

  it("lists what merged by itself, per side, on demand", () => {
    open()
    render(<MergeConflictModal />)
    const toggle = screen.getByRole("button", { name: "1 other change merged automatically" })
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByText(/Added “n”/)).not.toBeInTheDocument()
    fireEvent.click(toggle)
    expect(screen.getByText("From your account, arriving on this device")).toBeInTheDocument()
    expect(screen.getByText("Added “n” in Work › General › Reading › Inbox")).toBeInTheDocument()
  })

  it("says that leaving without choosing pauses sync", () => {
    open()
    render(<MergeConflictModal />)
    expect(screen.queryByRole("button", { name: "Ignore for now" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Pause sync and decide later" }))
    expect(dismiss).toHaveBeenCalledTimes(1)
  })

  it("offers Keep both for a tab's address and sends it apart from the sides", () => {
    const server = clone(base), local = clone(base)
    server[0].projects[0].categories[0].groups[0].tabs[0].url = "https://a.example/88"
    local[0].projects[0].categories[0].groups[0].tabs[0].url = "https://a.example/91"
    const { conflicts } = merge3(base, server, local)
    useMergeConflict.getState().open(conflicts, base, server, local)
    render(<MergeConflictModal />)
    const tabBlock = screen.getByRole("region", { name: "Tab a" })
    expect(tabBlock).toHaveTextContent("Address was “https://a.example/”. Both sides changed it.")
    fireEvent.click(within(tabBlock).getByRole("radio", { name: /Keep both/ }))
    expect(screen.getByText("4 tabs after apply")).toBeInTheDocument() // a twice, b, x
    fireEvent.click(screen.getByRole("button", { name: "Resolve conflicts" }))
    expect(resolve).toHaveBeenCalledWith({ [conflicts[0].key]: "local" }, [conflicts[0].key])
    // The modal is gone, so the finished moment is a toast.
    expect(toast.success).toHaveBeenCalledWith("Conflicts resolved", { description: "1 choice kept. Syncing to your account." })
  })
})
