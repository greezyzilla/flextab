import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { ConfirmDialog } from "./confirm-dialog"

const setup = (destructive?: boolean) => render(
  <ConfirmDialog open onOpenChange={vi.fn()} title="Delete group?" message="Gone." destructive={destructive} onConfirm={vi.fn()} />,
)

describe("ConfirmDialog", () => {
  it("paints a destructive confirm red, without the accent gradient that would cover it", () => {
    setup()
    const confirm = screen.getByRole("button", { name: "Delete" })
    expect(confirm).toHaveClass("bg-destructive")
    expect(confirm).not.toHaveClass("accent-fill")
  })

  it("keeps the accent fill for a non-destructive confirm", () => {
    setup(false)
    expect(screen.getByRole("button", { name: "Delete" })).toHaveClass("accent-fill")
  })
})
