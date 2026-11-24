import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"

vi.mock("~src/services/syncEngine", () => ({ acknowledgeOverCap: vi.fn() }))
vi.mock("~src/lib/route", () => ({ navigate: vi.fn() }))

import { OverCapNotice } from "./OverCapNotice"
import { useOverCapNotice } from "~src/store/useOverCapNotice"
import { acknowledgeOverCap } from "~src/services/syncEngine"
import { navigate } from "~src/lib/route"

describe("OverCapNotice (TASK-33)", () => {
  beforeEach(() => { vi.clearAllMocks(); useOverCapNotice.getState().close() })

  it("renders nothing until a first upload is over the cap", () => {
    render(<OverCapNotice />)
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
  })

  it("says the cap, the count, how many to remove and that nothing is lost; Got it continues", () => {
    useOverCapNotice.getState().open(200, 150)
    render(<OverCapNotice />)
    expect(screen.getByRole("alertdialog")).toBeInTheDocument()
    expect(screen.getByText("Your plan syncs up to 150 tabs")).toBeInTheDocument()
    expect(screen.getByText("This device has 200 saved tabs. Nothing will sync until you remove 50 or upgrade. All 200 stay on this device.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Got it" }))
    expect(acknowledgeOverCap).toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })

  it("See plan continues too and opens Plan & Usage", () => {
    useOverCapNotice.getState().open(200, 150)
    render(<OverCapNotice />)
    fireEvent.click(screen.getByRole("button", { name: "See plan" }))
    expect(acknowledgeOverCap).toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledWith("/settings/plan")
  })

  it("Escape counts as Got it", () => {
    useOverCapNotice.getState().open(200, 150)
    render(<OverCapNotice />)
    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" })
    expect(acknowledgeOverCap).toHaveBeenCalled()
  })
})
