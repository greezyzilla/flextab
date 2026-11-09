import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { DeleteAccountDialog } from "./DeleteAccountDialog"
import { useAuthStore } from "~src/store/useAuthStore"
import { ApiError } from "~src/services/api"

const { billing, exportWorkspace } = vi.hoisted(() => ({ billing: vi.fn(), exportWorkspace: vi.fn() }))
vi.mock("~src/services/api", async (orig) => ({ ...(await orig<object>()), apiGetBillingStatus: billing }))
vi.mock("~src/services/exportWorkspace", () => ({ exportWorkspace }))

const deleteAccount = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  window.location.hash = "#/settings/account"
  billing.mockResolvedValue({ plan: "free", active: false })
  useAuthStore.setState({ user: { id: "u", email: "Me@Example.com", name: "Me" } as never, isAuthenticated: true, deleteAccount })
})

describe("DeleteAccountDialog (TASK-17)", () => {
  it("deletes only after the account email is typed, keeping this device's tabs by default", async () => {
    const onOpenChange = vi.fn()
    deleteAccount.mockResolvedValue(undefined)
    render(<DeleteAccountDialog open onOpenChange={onOpenChange} />)
    expect(screen.getByRole("alertdialog")).toHaveTextContent("It can't be undone.")
    const button = screen.getByRole("button", { name: "Delete account" })
    expect(button).toBeDisabled()
    expect(screen.getByRole("radio", { name: /Keep tabs on this device/ })).toBeChecked()
    // An instruction, never the email itself: that would read as already typed (TASK-36).
    expect(screen.getByLabelText(/to confirm/)).toHaveAttribute("placeholder", "Type your email")
    fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value: "someone@else.com" } })
    expect(button).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value: " me@example.com " } })
    expect(button).toBeEnabled()
    fireEvent.click(screen.getByRole("button", { name: "Download your tabs first" }))
    expect(exportWorkspace).toHaveBeenCalled()
    fireEvent.click(button)
    await waitFor(() => expect(deleteAccount).toHaveBeenCalledWith("me@example.com", { localData: "keep" }))
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(window.location.hash).toBe("#/")
  })

  it("says paid time ends, and points to Plan when a renewing subscription blocks it", async () => {
    billing.mockResolvedValue({ plan: "pro", active: true, ends_at: "2026-12-12T00:00:00Z" })
    deleteAccount.mockRejectedValue(new ApiError(409, "Cancel your subscription first"))
    const onOpenChange = vi.fn()
    render(<DeleteAccountDialog open onOpenChange={onOpenChange} />)
    expect(await screen.findByRole("note")).toHaveTextContent(/until .* ends now\. Paid time isn't refunded\./)
    fireEvent.click(screen.getByRole("radio", { name: /Remove tabs from this device too/ }))
    fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value: "me@example.com" } })
    fireEvent.keyDown(screen.getByLabelText(/to confirm/), { key: "Enter" })
    expect(await screen.findByRole("alert")).toHaveTextContent("Cancel it first")
    expect(deleteAccount).toHaveBeenCalledWith("me@example.com", { localData: "remove" })
    fireEvent.click(screen.getByRole("button", { name: "Open Plan & Usage" }))
    expect(window.location.hash).toBe("#/settings/plan")
  })

  it("reports any other failure without closing", async () => {
    deleteAccount.mockRejectedValue(new Error("offline"))
    render(<DeleteAccountDialog open onOpenChange={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value: "me@example.com" } })
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Your account was not deleted.")
  })
})
