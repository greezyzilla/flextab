import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
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
const { syncNow } = vi.hoisted(() => ({ syncNow: vi.fn(async () => ({ status: "conflict" })) }))
vi.mock("~src/services/syncEngine", () => ({ syncNow }))

// `synced`: tabs the account already holds on the server (0 = it never received any).
const plan = (cap: number, synced = 120) => ({ plan: "free", limits: { max_tabs_total: cap, max_tree_bytes: 0, max_snapshots: 0 }, usage: { total_tabs: synced, tree_bytes: 0, snapshots: 0 } }) as PlanStatus
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
  it("is the labelled way in to sign-in while signed out", async () => {
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

  it("is a keyboard-reachable button that opens the status, usage and sync settings", async () => {
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

  it("shows unsynced changes as the dot while connected, not as an error", async () => {
    useAuthStore.setState({ isAuthenticated: true, user: { id: "u1" } as never })
    useSyncStore.setState({ status: "online", dirty: true })
    const { container } = render(<TooltipProvider><SyncStatusIndicator /></TooltipProvider>)
    expect(container.querySelector(".bg-amber-400")).not.toBeNull()
    await userEvent.click(screen.getByRole("button", { name: "Sync status: Connected" }))
    expect(await screen.findByText("Unsynced changes. They upload in a few seconds")).toBeInTheDocument()
    expect(screen.queryByText("Sync error")).not.toBeInTheDocument()
  })

  it("shows usage in the header near the cap", async () => {
    useAuthStore.setState({ isAuthenticated: true, user: { id: "u1" } as never })
    useSavedSpacesStore.setState({ savedSpaces: withTabs(130) })
    render(<TooltipProvider><SyncStatusIndicator /></TooltipProvider>)
    expect(await screen.findByText("130/150")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Sync status: Connected, 130 of 150 tabs" })).toBeInTheDocument()
  })

  it("says nothing synced yet when the paused account never received a tab", async () => {
    getPlan.mockResolvedValue(plan(150, 0))
    useAuthStore.setState({ isAuthenticated: true, user: { id: "u1" } as never })
    useSyncStore.setState({ status: "error", limit: { message: "m", at: 0, limit: "max_tabs_total", cap: 150, got: 200 } })
    useSavedSpacesStore.setState({ savedSpaces: withTabs(200) })
    render(<TooltipProvider><SyncStatusIndicator /></TooltipProvider>)
    await userEvent.click(screen.getByRole("button", { name: "Sync status: Sync paused" }))
    expect(await screen.findByText("Nothing synced yet. 200 of 150 tabs. Remove 50 to sync, or upgrade. Everything stays on this device.")).toBeInTheDocument()
  })

  it("says Sync paused in words over the limit, with what to remove and See plan", async () => {
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

  it("names a paused conflict in words and reopens the resolver from the popover", async () => {
    useAuthStore.setState({ isAuthenticated: true, user: { id: "u1" } as never })
    useSyncStore.setState({ status: "paused", conflictPending: true })
    useSavedSpacesStore.setState({ savedSpaces: withTabs(130) })
    render(<TooltipProvider><SyncStatusIndicator /></TooltipProvider>)
    await waitFor(() => expect(usePlanStore.getState().status).not.toBeNull())
    expect(screen.queryByText("130/150")).not.toBeInTheDocument() // one label at a time
    const trigger = screen.getByRole("button", { name: "Sync status: Sync conflict" })
    expect(trigger).toHaveTextContent("Sync conflict")
    await userEvent.click(trigger)
    expect(await screen.findByText(/Sync is paused until you choose which changes to keep/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Resolve conflict" }))
    expect(syncNow).toHaveBeenCalledTimes(1)
  })
})

describe("SyncStatusIndicator when the browser took away access", () => {
  const c = chrome as unknown as Record<string, unknown>
  afterEach(() => {
    useSyncStore.setState({ apiAccess: true })
    delete c.permissions
  })

  it("says Sync off in words, over any other state, and asks for access again from the click", async () => {
    const request = vi.fn(async () => true)
    c.permissions = { request }
    useAuthStore.setState({ isAuthenticated: true, user: { id: "u" } as never })
    useSyncStore.setState({ apiAccess: false, status: "paused", dirty: true, conflictPending: true })
    render(<TooltipProvider><SyncStatusIndicator /></TooltipProvider>)
    const badge = screen.getByRole("button", { name: "Sync status: Sync off" })
    expect(badge).toHaveTextContent("Sync off")
    expect(badge).not.toHaveTextContent("Sync conflict")
    await userEvent.click(badge)
    expect(await screen.findByText(/turned off FlexTab's access to its server/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Allow access" }))
    expect(request).toHaveBeenCalledWith({ origins: [expect.any(String)] })
  })

  it("is not shown while signed out: local use needs no server", () => {
    useAuthStore.setState({ isAuthenticated: false })
    useSyncStore.setState({ apiAccess: false })
    render(<TooltipProvider><SyncStatusIndicator /></TooltipProvider>)
    expect(screen.getByRole("button", { name: "Sign in to sync" })).toBeInTheDocument()
    expect(screen.queryByText("Sync off")).not.toBeInTheDocument()
  })
})

describe("SyncStatusIndicator when the server refused this version", () => {
  const runtime = chrome.runtime as unknown as Record<string, unknown>
  afterEach(() => {
    useSyncStore.setState({ updateRequired: false, apiAccess: true })
    delete runtime.requestUpdateCheck
  })

  it("says Update needed in words, over Sync off, and reports a check that found nothing", async () => {
    runtime.requestUpdateCheck = vi.fn(async () => ({ status: "no_update" }))
    useAuthStore.setState({ isAuthenticated: true, user: { id: "u" } as never })
    useSyncStore.setState({ updateRequired: true, apiAccess: false, status: "paused" })
    render(<TooltipProvider><SyncStatusIndicator /></TooltipProvider>)
    const badge = screen.getByRole("button", { name: "Sync status: Update needed" })
    expect(badge).not.toHaveTextContent("Sync off")
    await userEvent.click(badge)
    expect(await screen.findByText(/too old to sync/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Check for update" }))
    expect(await screen.findByText(/No update yet/)).toBeInTheDocument()
  })

  it("says the update is on its way when one is found", async () => {
    runtime.requestUpdateCheck = vi.fn(async () => ({ status: "update_available" }))
    useAuthStore.setState({ isAuthenticated: true, user: { id: "u" } as never })
    useSyncStore.setState({ updateRequired: true, status: "paused" })
    render(<TooltipProvider><SyncStatusIndicator /></TooltipProvider>)
    await userEvent.click(screen.getByRole("button", { name: "Sync status: Update needed" }))
    await userEvent.click(screen.getByRole("button", { name: "Check for update" }))
    expect(await screen.findByText(/Updating now/)).toBeInTheDocument()
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: "flextab:apply-update-now" })
  })
})
