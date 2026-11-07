import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SyncStatusIndicator } from "./SyncStatusIndicator"
import { TooltipProvider } from "./ui/tooltip"
import { useAuthStore } from "~src/store/useAuthStore"
import { useSyncStore } from "~src/store/useSyncStore"
import { usePlanStore } from "~src/store/usePlanStore"
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore"
import type { PlanStatus } from "~src/services/api"
import type { SavedSpace } from "~src/types"

const { getPlan } = vi.hoisted(() => ({ getPlan: vi.fn() }))
vi.mock("~src/services/api", async (orig) => ({ ...(await orig<object>()), apiGetPlan: getPlan }))

const plan = (cap: number) => ({ plan: "free", limits: { max_tabs_total: cap, max_tree_bytes: 0, max_snapshots: 0 }, usage: { total_tabs: 0, tree_bytes: 0, snapshots: 0 } }) as PlanStatus
const withTabs = (n: number): SavedSpace[] => [{ id: "s", name: "Work", order: 0, projects: [{ id: "p", name: "P", order: 0, categories: [{ id: "c", name: "C", order: 0,
  groups: [{ id: "g", name: "G", order: 0, tabs: Array.from({ length: n }, (_, i) => ({ id: `t${i}`, url: `https://${i}.example/`, title: `${i}`, favicon: "", order: i })) }] }] }] }]

beforeEach(() => {
  window.history.replaceState(null, "", "#/")
  getPlan.mockReset().mockResolvedValue(plan(150))
  usePlanStore.setState({ status: null })
  useSyncStore.setState({ status: "online", limit: null, dirty: false, conflictPending: false })
  useSavedSpacesStore.setState({ savedSpaces: withTabs(10) })
})

describe("SyncStatusIndicator", () => {
  it("is the labelled way in to sign-in while signed out (TASK-7)", async () => {
    useAuthStore.setState({ isAuthenticated: false })
    render(<TooltipProvider><SyncStatusIndicator /></TooltipProvider>)
    await userEvent.click(screen.getByRole("button", { name: "Sign in to sync" }))
    await waitFor(() => expect(window.location.hash).toBe("#/signin"))
  })

  it("is a status, not a sign-in button, once signed in", () => {
    useAuthStore.setState({ isAuthenticated: true })
    render(<TooltipProvider><SyncStatusIndicator /></TooltipProvider>)
    expect(screen.queryByRole("button", { name: "Sign in to sync" })).not.toBeInTheDocument()
  })

  it("is a keyboard-reachable button that opens the status, usage and sync settings (TASK-10)", async () => {
    useAuthStore.setState({ isAuthenticated: true, user: { id: "u1" } as never })
    render(<TooltipProvider><SyncStatusIndicator /></TooltipProvider>)
    await waitFor(() => expect(usePlanStore.getState().status).not.toBeNull())
    // Far from the cap: no number in the header.
    expect(screen.getByRole("button", { name: "Sync status: Connected" })).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Sync status: Connected" }))
    expect(await screen.findByText("Tabs")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "See plan" })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Sync settings" }))
    await waitFor(() => expect(window.location.hash).toBe("#/settings/sync"))
  })

  it("shows usage in the header near the cap", async () => {
    useAuthStore.setState({ isAuthenticated: true, user: { id: "u1" } as never })
    useSavedSpacesStore.setState({ savedSpaces: withTabs(130) })
    render(<TooltipProvider><SyncStatusIndicator /></TooltipProvider>)
    expect(await screen.findByText("130/150")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Sync status: Connected, 130 of 150 tabs" })).toBeInTheDocument()
  })

  it("says Sync paused in words over the limit, with what to remove and See plan (TASK-9)", async () => {
    useAuthStore.setState({ isAuthenticated: true, user: { id: "u1" } as never })
    useSyncStore.setState({ status: "error", limit: { message: "m", at: 0, limit: "max_tabs_total", cap: 150, got: 190 } })
    useSavedSpacesStore.setState({ savedSpaces: withTabs(170) })
    render(<TooltipProvider><SyncStatusIndicator /></TooltipProvider>)
    const trigger = screen.getByRole("button", { name: "Sync status: Sync paused" })
    expect(trigger).toHaveTextContent("Sync paused")
    await userEvent.click(trigger)
    expect(await screen.findByText("170 of 150 tabs. Remove 20 to sync again, or upgrade. Everything stays on this device.")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "See plan" }))
    await waitFor(() => expect(window.location.hash).toBe("#/settings/plan"))
  })
})
