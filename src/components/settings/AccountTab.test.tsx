import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { AccountTab } from "./AccountTab"
import { useAuthStore } from "~src/store/useAuthStore"
import { apiListIdentities } from "~src/services/api"

vi.mock("~src/services/api", async importOriginal => ({
  ...await importOriginal<typeof import("~src/services/api")>(),
  apiGetAuthProviders: vi.fn(async () => ["google", "github"]),
  apiListIdentities: vi.fn(),
}))

beforeEach(() => {
  useAuthStore.setState({ isAuthenticated: true, user: { id: "u", name: "Me", email: "me@example.com", avatar: "", provider: "email", has_password: true } })
})

describe("AccountTab sign-in methods (TASK-8)", () => {
  it("warns a password-only account that it cannot be recovered, and offers linking", async () => {
    vi.mocked(apiListIdentities).mockResolvedValue({ identities: [], has_password: true })
    render(<AccountTab />)
    expect(await screen.findByRole("note")).toHaveTextContent("FlexTab can't reset it")
    expect(await screen.findByRole("button", { name: "Link Google" })).toBeInTheDocument()
  })

  it("does not warn once a provider is linked", async () => {
    vi.mocked(apiListIdentities).mockResolvedValue({ identities: [{ provider: "google", email: "me@example.com" }], has_password: true } as any)
    render(<AccountTab />)
    expect(await screen.findByText("google")).toBeInTheDocument()
    expect(screen.queryByRole("note")).not.toBeInTheDocument()
  })

  it("ends with a danger zone that opens account deletion (TASK-17)", async () => {
    render(<AccountTab />)
    const zone = screen.getByRole("region", { name: "Danger zone" })
    fireEvent.click(within(zone).getByRole("button", { name: "Delete account…" }))
    expect(await screen.findByRole("alertdialog", { name: "Delete your account?" })).toBeInTheDocument()
  })

  it("keeps red for the danger zone: sign out is a neutral row, password fields have labels", async () => {
    render(<AccountTab />)
    expect(screen.getByRole("button", { name: "Sign out…" })).not.toHaveClass("!text-danger")
    // The password form opens on demand, with labels that stay visible.
    expect(screen.queryByLabelText("Current password")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Change password…" }))
    expect(screen.getByLabelText("Current password")).toHaveAttribute("type", "password")
    expect(screen.getByLabelText("New password")).toBeInTheDocument()
    expect(screen.getByLabelText("Confirm new password")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(screen.queryByLabelText("Current password")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Sign out…" }))
    expect(await screen.findByRole("alertdialog", { name: "Sign out of FlexTab?" })).toBeInTheDocument()
  })

  it("adds a password for an OAuth account, then folds the form away with a confirmation", async () => {
    useAuthStore.setState({ user: { id: "u", name: "Me", email: "me@example.com", avatar: "", provider: "google", has_password: false } as never })
    vi.mocked(apiListIdentities).mockResolvedValue({ identities: [{ provider: "google", email: "me@example.com" }], has_password: false } as never)
    const spy = vi.spyOn(await import("~src/services/api"), "apiChangePassword").mockResolvedValue(undefined)
    render(<AccountTab />)
    expect(screen.getByText(/Optional\. Lets you sign in with me@example\.com too/)).toBeInTheDocument()
    fireEvent.click(await screen.findByRole("button", { name: "Add a password…" }))
    expect(screen.queryByLabelText("Current password")).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "short" } })
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "short" } })
    fireEvent.submit(screen.getByLabelText("New password").closest("form")!)
    expect(await screen.findByRole("alert")).toHaveTextContent("at least 8 characters")
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "long-enough" } })
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "long-enough" } })
    fireEvent.submit(screen.getByLabelText("New password").closest("form")!)
    expect(await screen.findByRole("status")).toHaveTextContent("Password updated")
    expect(spy).toHaveBeenCalledWith("", "long-enough")
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument()
  })
})
