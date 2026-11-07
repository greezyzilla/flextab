import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { MergeConflictModal } from "./MergeConflictModal"
import { useMergeConflict } from "~src/store/useMergeConflict"
import { merge3 } from "~src/services/spacesMerge3"
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

describe("MergeConflictModal (TASK-29)", () => {
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

  it("chooses nothing for the user: Apply waits for every conflict", () => {
    open()
    render(<MergeConflictModal />)
    const apply = screen.getByRole("button", { name: "Apply" })
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
    expect(resolve).toHaveBeenCalledWith({ [name]: "server", [deleted]: "server" })
  })

  it("chooses one side for every conflict at once", () => {
    open()
    render(<MergeConflictModal />)
    fireEvent.click(screen.getByRole("button", { name: "This device" }))
    expect(screen.getByRole("button", { name: "Apply" })).toBeEnabled()
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

  it("says that leaving without choosing pauses sync (TASK-10)", () => {
    open()
    render(<MergeConflictModal />)
    expect(screen.queryByRole("button", { name: "Ignore for now" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Pause sync and decide later" }))
    expect(dismiss).toHaveBeenCalledTimes(1)
  })
})
