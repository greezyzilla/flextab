import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
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
    expect(await screen.findByText("Google")).toBeInTheDocument()
    expect(screen.queryByRole("note")).not.toBeInTheDocument()
  })

  it("draws every provider as the same row, linked or not, so linking never reshapes the list (TASK-41)", async () => {
    vi.mocked(apiListIdentities).mockResolvedValue({ identities: [{ provider: "google", email: "me@example.com" }], has_password: false } as never)
    render(<AccountTab />)
    const unlink = await screen.findByRole("button", { name: "Unlink" })
    const link = screen.getByRole("button", { name: "Link GitHub" })
    expect(link).toHaveTextContent("Link")
    const googleRow = unlink.parentElement!, githubRow = link.parentElement!
    expect(googleRow.className).toBe(githubRow.className)
    expect(within(googleRow).getByText("me@example.com")).toBeInTheDocument()
    expect(within(githubRow).getByText("Not linked")).toBeInTheDocument()
  })

  it("holds one placeholder row per provider while the list loads (TASK-41)", async () => {
    vi.mocked(apiListIdentities).mockReturnValue(new Promise(() => {}))
    render(<AccountTab />)
    const loading = screen.getByRole("status", { name: "Loading sign-in methods" })
    expect(loading.children).toHaveLength(2)
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument()
  })

  it("lists a linked provider the app does not know, and drops one the server has not configured", async () => {
    const api = await import("~src/services/api")
    vi.mocked(api.apiGetAuthProviders).mockResolvedValueOnce(["google"])
    vi.mocked(apiListIdentities).mockResolvedValue({ identities: [{ provider: "apple", email: "" }], has_password: true } as never)
    render(<AccountTab />)
    expect(await screen.findByText("apple")).toBeInTheDocument()
    expect(screen.getByText("Linked")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Link Google" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Link GitHub" })).not.toBeInTheDocument()
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
    // The password form opens in a modal, with labels that stay visible.
    expect(screen.queryByLabelText("Current password")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Change password…" }))
    expect(await screen.findByRole("dialog", { name: "Change password" })).toBeInTheDocument()
    expect(screen.getByLabelText("Current password")).toHaveAttribute("type", "password")
    expect(screen.getByLabelText("New password")).toBeInTheDocument()
    expect(screen.getByLabelText("Confirm new password")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByLabelText("Current password")).not.toBeInTheDocument())
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
    expect(await screen.findByText(/Password updated/)).toHaveAttribute("role", "status")
    expect(spy).toHaveBeenCalledWith("", "long-enough")
    await waitFor(() => expect(screen.queryByLabelText("New password")).not.toBeInTheDocument())
  })

  it("submits the password modal with Enter or its footer button", async () => {
    const spy = vi.spyOn(await import("~src/services/api"), "apiChangePassword").mockResolvedValue(undefined)
    vi.mocked(apiListIdentities).mockResolvedValue({ identities: [], has_password: true })
    render(<AccountTab />)
    fireEvent.click(screen.getByRole("button", { name: "Change password…" }))
    fireEvent.change(await screen.findByLabelText("Current password"), { target: { value: "old-password" } })
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "new-password" } })
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "other" } })
    fireEvent.keyDown(screen.getByLabelText("Confirm new password"), { key: "Enter" })
    expect(await screen.findByRole("alert")).toHaveTextContent("do not match")
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "new-password" } })
    fireEvent.click(screen.getByRole("button", { name: "Update password" }))
    await waitFor(() => expect(spy).toHaveBeenCalledWith("old-password", "new-password"))
  })
})

describe("AccountTab input labels and placeholders (TASK-36)", () => {
  it("names the display name field from its visible label, filled or empty, with an example placeholder", async () => {
    vi.mocked(apiListIdentities).mockResolvedValue({ identities: [], has_password: true })
    render(<AccountTab />)
    const field = screen.getByRole("textbox", { name: "Display name" })
    expect(field).toHaveValue("Me")
    expect(field).toHaveAccessibleDescription("Shown across FlexTab. Independent of your provider.")
    fireEvent.change(field, { target: { value: "" } })
    expect(screen.getByRole("textbox", { name: "Display name" })).toHaveAttribute("placeholder", "e.g. Alex Rivera")
  })

  it("gives the password fields their placeholders, with the length rule before typing", async () => {
    vi.mocked(apiListIdentities).mockResolvedValue({ identities: [], has_password: true })
    render(<AccountTab />)
    fireEvent.click(screen.getByRole("button", { name: "Change password…" }))
    expect(screen.getByLabelText("Current password")).toHaveAttribute("placeholder", "Enter your current password")
    expect(screen.getByLabelText("New password")).toHaveAttribute("placeholder", "At least 8 characters")
    expect(screen.getByLabelText("Confirm new password")).toHaveAttribute("placeholder", "Enter the new password again")
  })
})
