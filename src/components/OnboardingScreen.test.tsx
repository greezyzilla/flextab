import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { OnboardingScreen } from "./OnboardingScreen"
import { useAuthStore } from "~src/store/useAuthStore"

vi.mock("~src/services/api", async importOriginal => ({
  ...await importOriginal<typeof import("~src/services/api")>(),
  apiGetAuthProviders: vi.fn(async () => ["google", "github"]),
}))

const loginWithEmail = vi.fn()
const loginWithGoogle = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({ loginWithEmail, loginWithGoogle, loginWithGithub: vi.fn() })
})

describe("sign-in screen (TASK-7)", () => {
  it("leads with a neutral heading and the one-click providers, email after", async () => {
    render(<OnboardingScreen onBack={vi.fn()} />)
    expect(screen.getByRole("heading", { name: "Sync your tabs" })).toBeInTheDocument()
    expect(screen.queryByText("Welcome back")).not.toBeInTheDocument()
    await screen.findByRole("button", { name: /Continue with GitHub/ })
    const order = screen.getAllByRole("button").map(b => b.textContent ?? "")
    expect(order.findIndex(t => t.includes("Continue with Google"))).toBeLessThan(order.findIndex(t => t === "Sign in"))
  })

  it("keeps field labels while typing and reports errors as an alert", async () => {
    loginWithEmail.mockRejectedValue(new Error("Invalid email or password"))
    const user = userEvent.setup()
    render(<OnboardingScreen onBack={vi.fn()} />)
    await user.type(screen.getByLabelText("Email"), "me@example.com")
    await user.type(screen.getByLabelText("Password"), "wrongpass")
    expect(screen.getByLabelText("Email")).toHaveValue("me@example.com")
    await user.click(screen.getByRole("button", { name: "Sign in" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password")
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-describedby", "signin-error")
  })

  it("shows an example email and a password instruction as placeholders (TASK-36)", () => {
    render(<OnboardingScreen onBack={vi.fn()} />)
    expect(screen.getByLabelText("Email")).toHaveAttribute("placeholder", "you@example.com")
    expect(screen.getByLabelText("Password")).toHaveAttribute("placeholder", "Enter your password")
  })

  it("creates new accounts only through Google or GitHub (TASK-8)", () => {
    render(<OnboardingScreen onBack={vi.fn()} />)
    expect(screen.getByText(/Google or GitHub signs you in, or creates a free account/)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Create an account|Create account/ })).not.toBeInTheDocument()
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument()
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "current-password")
  })

})
