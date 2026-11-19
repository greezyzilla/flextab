import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { OnboardingScreen } from "./OnboardingScreen"
import { ApiError, apiForgotPassword, apiGetSignInOptions, apiRegister, apiResendVerification } from "~src/services/api"
import { OAUTH_PENDING_KEY } from "~src/services/oauthLogin"
import { useAuthStore } from "~src/store/useAuthStore"
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore"
import { useSettingsStore } from "~src/store/useSettingsStore"
import { useSyncConflict } from "~src/store/useSyncConflict"
import type { SavedSpace } from "~src/types"
import { TooltipProvider } from "~src/components/ui/tooltip"
import { stubResizeObserver } from "~src/test/stubResizeObserver"

vi.mock("~src/services/api", async importOriginal => ({
  ...await importOriginal<typeof import("~src/services/api")>(),
  apiGetSignInOptions: vi.fn(async () => ({ providers: ["google", "github"], emailSignup: true })),
  apiRegister: vi.fn(async () => ({ status: "verification_sent" })),
  apiResendVerification: vi.fn(async () => ({ status: "sent_if_waiting" })),
  apiForgotPassword: vi.fn(async () => ({ status: "sent_if_registered" })),
}))

// The compact provider row names each mark with an app tooltip.
stubResizeObserver()

const loginWithEmail = vi.fn()
const loginWithGoogle = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({ loginWithEmail, loginWithGoogle, loginWithGithub: vi.fn(), isAuthenticated: false, user: null })
  useSavedSpacesStore.setState({ savedSpaces: [] })
  useSyncConflict.setState({ pending: false })
})

/** The form appears once the sign-in options are known (no late rows pushing it down). */
const ready = () => screen.findByRole("button", { name: /Continue with Google/ })

/** The chrome typings overload each call with a callback form; the mocks answer with promises. */
const resolve = (fn: unknown, value: unknown) => (fn as ReturnType<typeof vi.fn>).mockResolvedValue(value)

const space = (id: string, tabs: number): SavedSpace => ({
  id, name: id, order: 0,
  projects: [{ id: `${id}p`, name: "P", order: 0, categories: [{ id: `${id}c`, name: "C", order: 0, groups: [{ id: `${id}g`, name: "G", order: 0,
    tabs: Array.from({ length: tabs }, (_, i) => ({ id: `${id}t${i}`, title: "t", url: "https://example.com", favicon: "", order: i })) }] }] }],
}) as SavedSpace

describe("sign-in screen (TASK-7)", () => {
  it("leads with a neutral heading and the one-click providers, email after", async () => {
    render(<OnboardingScreen onBack={vi.fn()} />)
    await ready()
    expect(screen.getByRole("heading", { name: "Your tabs, on every device" })).toBeInTheDocument()
    expect(screen.queryByText("Welcome back")).not.toBeInTheDocument()
    await screen.findByRole("button", { name: /Continue with GitHub/ })
    const order = screen.getAllByRole("button").map(b => b.textContent ?? "")
    expect(order.findIndex(t => t.includes("Continue with Google"))).toBeLessThan(order.findIndex(t => t === "Sign in"))
  })

  it("keeps field labels while typing and reports errors as an alert", async () => {
    loginWithEmail.mockRejectedValue(new Error("Invalid email or password"))
    const user = userEvent.setup()
    render(<OnboardingScreen onBack={vi.fn()} />)
    await ready()
    await user.type(screen.getByLabelText("Email"), "me@example.com")
    await user.type(screen.getByLabelText("Password"), "wrongpass")
    expect(screen.getByLabelText("Email")).toHaveValue("me@example.com")
    await user.click(screen.getByRole("button", { name: "Sign in" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password")
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-describedby", "signin-error")
  })

  it("shows an example email and a password instruction as placeholders (TASK-36)", async () => {
    render(<OnboardingScreen onBack={vi.fn()} />)
    await ready()
    expect(screen.getByLabelText("Email")).toHaveAttribute("placeholder", "you@example.com")
    expect(screen.getByLabelText("Password")).toHaveAttribute("placeholder", "Enter your password")
  })

  it("offers email sign-up and reset only when the server can send the link (TASK-79)", async () => {
    vi.mocked(apiGetSignInOptions).mockResolvedValueOnce({ providers: ["google"], emailSignup: false })
    const { unmount } = render(<OnboardingScreen onBack={vi.fn()} />)
    await screen.findByRole("button", { name: /Continue with Google/ })
    expect(screen.queryByRole("button", { name: "Create an account" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Forgot password?" })).not.toBeInTheDocument()
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "current-password")
    unmount()
    render(<OnboardingScreen onBack={vi.fn()} />)
    expect(await screen.findByRole("button", { name: "Create an account" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Forgot password?" })).toBeInTheDocument()
  })

  it("creates an account with any email, then waits for its link and signs in by itself (TASK-79)", async () => {
    const user = userEvent.setup()
    render(<OnboardingScreen onBack={vi.fn()} />)
    await ready()
    await user.click(await screen.findByRole("button", { name: "Create an account" }))
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "new-password")
    await user.type(screen.getByLabelText("Email"), " me@own-domain.test ")
    await user.type(screen.getByLabelText("Password"), "password1")
    await user.click(screen.getByRole("button", { name: "Create account" }))
    expect(apiRegister).toHaveBeenCalledWith("me@own-domain.test", "password1")
    expect(await screen.findByText("Check your email")).toBeInTheDocument()
    expect(screen.getByText("me@own-domain.test")).toBeInTheDocument()
    // One email a minute: the resend waits, and says how long.
    expect(screen.getByRole("button", { name: /Resend email in \d+s/ })).toBeDisabled()
    // Not opened yet: say so, keep waiting.
    loginWithEmail.mockRejectedValueOnce(new ApiError(403, "Verify your email", "email_unverified"))
    await user.click(screen.getByRole("button", { name: "I've opened the link" }))
    expect(await screen.findByText(/Not verified yet/)).toBeInTheDocument()
    // Back from the email: it tries to sign in without being asked.
    loginWithEmail.mockResolvedValueOnce(undefined)
    act(() => { window.dispatchEvent(new Event("focus")) })
    expect(loginWithEmail).toHaveBeenLastCalledWith("me@own-domain.test", "password1")
    // A typo in the address: back to the form, address kept.
    await user.click(screen.getByRole("button", { name: "Use a different email" }))
    expect(screen.getByRole("button", { name: "Create account" })).toBeInTheDocument()
    expect(screen.getByLabelText("Email")).toHaveValue("me@own-domain.test")
  })

  it("sends an unverified sign-in back to its link, and resends it after the wait (TASK-79)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      loginWithEmail.mockRejectedValueOnce(new ApiError(403, "Verify your email", "email_unverified"))
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<OnboardingScreen onBack={vi.fn()} />)
      await ready()
      await user.type(screen.getByLabelText("Email"), "me@own-domain.test")
      await user.type(screen.getByLabelText("Password"), "password1")
      await user.click(screen.getByRole("button", { name: "Sign in" }))
      expect(await screen.findByText("Check your email")).toBeInTheDocument()
      act(() => { vi.advanceTimersByTime(61_000) })
      await user.click(await screen.findByRole("button", { name: "Resend email" }))
      expect(apiResendVerification).toHaveBeenCalledWith("me@own-domain.test")
      expect(await screen.findByText(/Sent again/)).toBeInTheDocument()
      // The server's own wait wins when it asks for one.
      vi.mocked(apiResendVerification).mockRejectedValueOnce(new ApiError(429, "slow down", "email_throttled", 42))
      act(() => { vi.advanceTimersByTime(61_000) })
      await user.click(await screen.findByRole("button", { name: "Resend email" }))
      expect(await screen.findByText(/Ask again in 42s/)).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /Resend email in \d+s/ })).toBeDisabled()
    } finally {
      vi.useRealTimers()
    }
  })

  it("resets a forgotten password by email, with the typed address (TASK-79)", async () => {
    const user = userEvent.setup()
    render(<OnboardingScreen onBack={vi.fn()} />)
    await ready()
    await user.type(screen.getByLabelText("Email"), "me@own-domain.test")
    await user.click(await screen.findByRole("button", { name: "Forgot password?" }))
    expect(screen.getByLabelText("Email")).toHaveValue("me@own-domain.test")
    vi.mocked(apiForgotPassword).mockRejectedValueOnce(new ApiError(503, "x", "email_unavailable"))
    await user.click(screen.getByRole("button", { name: "Send reset link" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(/Email is off right now/)
    await user.click(screen.getByRole("button", { name: "Send reset link" }))
    expect(apiForgotPassword).toHaveBeenLastCalledWith("me@own-domain.test")
    expect(await screen.findByText("Check your email")).toBeInTheDocument()
    expect(screen.getByText(/a reset link is on its way/)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Back to sign in" }))
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument()
  })

  it("draws the actions all at once when the options are known, so nothing moves in later (TASK-79)", async () => {
    let answer: (v: { providers: string[]; emailSignup: boolean }) => void = () => {}
    vi.mocked(apiGetSignInOptions).mockReturnValueOnce(new Promise(r => { answer = r }))
    render(<OnboardingScreen onBack={vi.fn()} />)
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Continue with/ })).not.toBeInTheDocument()
    await act(async () => answer({ providers: ["google", "github"], emailSignup: true }))
    expect(screen.getByRole("button", { name: /Continue with GitHub/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Forgot password?" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Continue with Google/ })).toHaveFocus()
    // The message line under the button is there, empty, so a message never moves anything.
    expect(screen.getByRole("alert")).toBeEmptyDOMElement()
  })

  it("offers sync in the person's own numbers, with the privacy promise (TASK-79)", async () => {
    useSavedSpacesStore.setState({ savedSpaces: [space("a", 2), space("b", 1)] })
    render(<OnboardingScreen onBack={vi.fn()} />)
    await ready()
    expect(screen.getByRole("dialog")).toHaveTextContent("Back up 3 tabs. Open them anywhere.")
    expect(screen.getByText("We never read or sell your browsing.")).toBeInTheDocument()
  })

  it("offers sync without numbers to an empty workspace (TASK-79)", async () => {
    render(<OnboardingScreen onBack={vi.fn()} />)
    await ready()
    expect(screen.getByRole("dialog")).toHaveTextContent("Open your tabs on any computer.")
  })

  it("offers GitLab and Discord when the server has them, as one row of named marks past two providers (TASK-79)", async () => {
    const loginWithGitlab = vi.fn(), loginWithDiscord = vi.fn()
    useAuthStore.setState({ loginWithGitlab, loginWithDiscord })
    vi.mocked(apiGetSignInOptions).mockResolvedValueOnce({ providers: ["discord", "google", "gitlab", "github"], emailSignup: true })
    const user = userEvent.setup()
    render(<TooltipProvider><OnboardingScreen onBack={vi.fn()} /></TooltipProvider>)
    const google = await ready()
    const row = ["Google", "GitHub", "GitLab", "Discord"].map(n => screen.getByRole("button", { name: `Continue with ${n}` }))
    // Fixed order whatever the server lists; marks only, the name is the button's label.
    expect(row.every(b => b.textContent === "" && b.parentElement === google.parentElement)).toBe(true)
    expect(google).toHaveFocus()
    await user.click(row[2])
    expect(loginWithGitlab).toHaveBeenCalledOnce()
    await user.click(row[3])
    expect(loginWithDiscord).toHaveBeenCalledOnce()
  })

  it("keeps full buttons with their names for two providers or fewer (TASK-79)", async () => {
    vi.mocked(apiGetSignInOptions).mockResolvedValueOnce({ providers: ["gitlab", "google"], emailSignup: false })
    render(<OnboardingScreen onBack={vi.fn()} />)
    expect((await ready()).textContent).toBe("Continue with Google")
    expect(screen.getByRole("button", { name: "Continue with GitLab" })).toHaveTextContent("Continue with GitLab")
    expect(screen.queryByRole("button", { name: /Continue with (GitHub|Discord)/ })).not.toBeInTheDocument()
  })

  it("waits on the provider's tab, can bring it back, and can stop (TASK-79)", async () => {
    resolve(chrome.storage.session.get, { [OAUTH_PENDING_KEY]: { tabId: 7 } })
    resolve(chrome.tabs.update, { windowId: 3 })
    resolve(chrome.tabs.remove, undefined)
    const user = userEvent.setup()
    render(<OnboardingScreen onBack={vi.fn()} />)
    await ready()
    await user.click(screen.getByRole("button", { name: /Continue with Google/ }))
    expect(loginWithGoogle).toHaveBeenCalledOnce()
    expect(await screen.findByText("Finish in the Google tab")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Open the Google tab" }))
    expect(chrome.tabs.update).toHaveBeenCalledWith(7, { active: true })
    await vi.waitFor(() => expect(chrome.windows.update).toHaveBeenCalledWith(3, { focused: true }))
    await user.click(screen.getByRole("button", { name: "Cancel" }))
    expect(chrome.tabs.remove).toHaveBeenCalledWith(7)
    expect(screen.getByRole("button", { name: /Continue with Google/ })).toBeInTheDocument()
    resolve(chrome.storage.session.get, {})
  })

  it("says so when the provider's tab is closed without signing in, and can try again (TASK-79)", async () => {
    resolve(chrome.storage.session.get, { [OAUTH_PENDING_KEY]: { tabId: 7 } })
    const user = userEvent.setup()
    render(<OnboardingScreen onBack={vi.fn()} />)
    await ready()
    await user.click(screen.getByRole("button", { name: /Continue with Google/ }))
    await screen.findByText("Finish in the Google tab")
    const onRemoved = vi.mocked(chrome.tabs.onRemoved.addListener).mock.calls.at(-1)![0] as (tabId: number) => void
    act(() => onRemoved(8)) // another tab: still waiting
    expect(screen.getByText("Finish in the Google tab")).toBeInTheDocument()
    await act(async () => onRemoved(7))
    expect(await screen.findByText("The Google tab was closed")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Try again" }))
    expect(loginWithGoogle).toHaveBeenCalledTimes(2)
    resolve(chrome.storage.session.get, {})
  })

  it("shows the result and the next computer once signed in, then goes back to the tabs (TASK-79)", async () => {
    useSettingsStore.setState({ autoSync: true })
    useSavedSpacesStore.setState({ savedSpaces: [space("a", 2)] })
    const onBack = vi.fn()
    const user = userEvent.setup()
    render(<OnboardingScreen onBack={onBack} />)
    await ready()
    act(() => useAuthStore.setState({ isAuthenticated: true, user: { id: "u", email: "u@example.invalid", name: "U", avatar: "", provider: "google", has_password: false } as never }))
    expect(screen.getByText("Sync is on")).toBeInTheDocument()
    expect(screen.getByText("Backing up 2 tabs…")).toBeInTheDocument()
    expect(screen.getByText("Sign in with Google")).toBeInTheDocument()
    expect(onBack).not.toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: "Go to my tabs" }))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it("says auto-sync is off instead of claiming a backup (TASK-79)", async () => {
    useSettingsStore.setState({ autoSync: false })
    render(<OnboardingScreen onBack={vi.fn()} />)
    await ready()
    act(() => useAuthStore.setState({ isAuthenticated: true }))
    expect(screen.getByText("You're signed in")).toBeInTheDocument()
    expect(screen.getByText(/Auto-sync is off/)).toBeInTheDocument()
    useSettingsStore.setState({ autoSync: true })
  })

  it("goes straight back to the tabs when already signed in (TASK-79)", () => {
    useAuthStore.setState({ isAuthenticated: true })
    const onBack = vi.fn()
    render(<OnboardingScreen onBack={onBack} />)
    expect(onBack).toHaveBeenCalledOnce()
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("steps aside while the sync choice is open (TASK-79)", () => {
    useSyncConflict.setState({ pending: true })
    render(<OnboardingScreen onBack={vi.fn()} />)
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })
})
