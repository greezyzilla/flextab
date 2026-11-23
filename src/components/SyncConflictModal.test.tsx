import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { SyncConflictModal } from "./SyncConflictModal"
import { useSyncConflict } from "~src/store/useSyncConflict"
import type { SavedSpace } from "~src/types"
import { usePlanStore } from "~src/store/usePlanStore"
import type { PlanStatus } from "~src/services/api"

vi.mock("~src/services/api", async (orig) => ({ ...(await orig<object>()), apiGetPlan: vi.fn(() => new Promise(() => {})) }))

vi.mock("~src/services/exportWorkspace", () => ({ exportWorkspace: vi.fn() }))
import { exportWorkspace } from "~src/services/exportWorkspace"

const space = (id: string, titles: string[]): SavedSpace => ({
  id, name: id, order: 0,
  projects: [{ id: id + "p", name: "P", order: 0, categories: [{ id: id + "c", name: "C", order: 0,
    groups: [{ id: id + "g", name: "G", order: 0, tabs: titles.map((t, i) => ({ id: `${id}${i}`, url: `https://${t}.example/`, title: t, favicon: "", order: i })) }] }] }],
})
const column = (name: string) => screen.getByRole("region", { name })

describe("SyncConflictModal", () => {
  it("shows both sides as recognisable tabs that do not change with the choice", () => {
    useSyncConflict.getState().open([space("account", ["Linear", "Figma"])], [space("device", ["Docs"])])
    render(<SyncConflictModal />)
    expect(within(column("On this device")).getByText("Docs")).toBeInTheDocument()
    expect(within(column("In this account")).getByText("Figma")).toBeInTheDocument()
    expect(screen.getAllByRole("radio")).toHaveLength(3)
    expect(screen.getByRole("radio", { name: /Merge both/ })).toBeChecked()
    expect(screen.getByText("Keeps 3 tabs")).toBeInTheDocument()
    // Choosing marks a side as removed; the lists themselves stay the same.
    fireEvent.click(screen.getByRole("radio", { name: /Keep this device's/ }))
    expect(within(column("In this account")).getByText("Removed")).toBeInTheDocument()
    expect(within(column("In this account")).getByText("Figma")).toBeInTheDocument()
    expect(within(column("On this device")).queryByText("Removed")).not.toBeInTheDocument()
    useSyncConflict.getState().close()
  })

  it("offers only upload or start empty when the account is empty (TASK-11)", () => {
    useSyncConflict.getState().open([], [space("kept", ["A", "B"])])
    render(<SyncConflictModal />)
    expect(screen.getByRole("alertdialog")).toHaveTextContent("tabs from an earlier sign-in")
    expect(within(column("In this account")).getByText("No tabs in this account yet.")).toBeInTheDocument()
    expect(screen.getAllByRole("radio")).toHaveLength(2)
    expect(screen.getByRole("radio", { name: /Add this device's tabs to this account/ })).toBeChecked()
    expect(screen.queryByRole("button", { name: "Download this device's tabs first" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("radio", { name: /Start with an empty account/ }))
    expect(within(column("On this device")).getByText("Removed")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Download this device's tabs first" }))
    expect(exportWorkspace).toHaveBeenCalled()
    useSyncConflict.getState().close()
  })

  it("chunks long groups behind +N more", () => {
    useSyncConflict.getState().open([], [space("many", ["t1", "t2", "t3", "t4", "t5", "t6", "t7"])])
    render(<SyncConflictModal />)
    expect(screen.queryByText("t7")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "+2 more" }))
    expect(screen.getByText("t7")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Show fewer" }))
    expect(screen.queryByText("t7")).not.toBeInTheDocument()
    useSyncConflict.getState().close()
  })

  it("starts big sides as a space overview, marks spaces in both, and drills down on demand", () => {
    const big = (id: string, name: string, n: number) => ({ ...space(id, Array.from({ length: n }, (_, i) => `${id}-tab${i}`)), name })
    const shared = big("shared", "Work", 10)
    useSyncConflict.getState().open([shared, big("clients", "Clients", 10)], [{ ...shared }, big("home", "Home", 10)])
    render(<SyncConflictModal />)
    const device = column("On this device")
    // Overview: spaces with counts, no tab rows yet.
    expect(within(device).getByRole("button", { name: /^Home, 1 group, 10 tabs$/ })).toHaveAttribute("aria-expanded", "false")
    expect(within(device).queryByText("home-tab0")).not.toBeInTheDocument()
    expect(within(device).getByRole("button", { name: /^Work, .*in both$/ })).toBeInTheDocument()
    expect(screen.getByText(/Work combined/)).toBeInTheDocument()
    // Space → groups → tabs.
    fireEvent.click(within(device).getByRole("button", { name: /^Home,/ }))
    fireEvent.click(within(device).getByRole("button", { name: /^P › C › G, 10 tabs$/ }))
    expect(within(device).getByText("home-tab0")).toBeInTheDocument()
    expect(within(device).getByRole("button", { name: "+5 more" })).toBeInTheDocument()
    useSyncConflict.getState().close()
  })

  it("says before applying when a choice uploads more tabs than the plan syncs (TASK-9)", () => {
    usePlanStore.setState({ status: { plan: "free", limits: { max_tabs_total: 2, max_tree_bytes: 0, max_snapshots: 0 }, usage: { total_tabs: 0, tree_bytes: 0, snapshots: 0 } } as PlanStatus })
    useSyncConflict.getState().open([space("account", ["A"])], [space("device", ["B", "C"])])
    render(<SyncConflictModal />)
    // Merge keeps 3 tabs on a 2-tab plan.
    expect(screen.getByRole("note")).toHaveTextContent("Your plan syncs up to 2 tabs. With 3, sync pauses until you remove 1.")
    // Keeping the account's own tabs never grows it.
    fireEvent.click(screen.getByRole("radio", { name: /Keep my account's/ }))
    expect(screen.queryByRole("note")).not.toBeInTheDocument()
    useSyncConflict.getState().close()
    usePlanStore.setState({ status: null })
  })
})
