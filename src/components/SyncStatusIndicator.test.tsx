import { beforeEach, describe, expect, it } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SyncStatusIndicator } from "./SyncStatusIndicator"
import { TooltipProvider } from "./ui/tooltip"
import { useAuthStore } from "~src/store/useAuthStore"

beforeEach(() => window.history.replaceState(null, "", "#/"))

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
})
