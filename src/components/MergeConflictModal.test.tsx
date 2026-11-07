import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { MergeConflictModal } from "./MergeConflictModal"
import { useMergeConflict } from "~src/store/useMergeConflict"
import type { Conflict } from "~src/services/spacesMerge3"

const { dismiss } = vi.hoisted(() => ({ dismiss: vi.fn() }))
vi.mock("~src/services/syncEngine", () => ({ dismissMergeConflicts: dismiss, resolveMergeConflicts: vi.fn() }))

describe("MergeConflictModal", () => {
  it("says that leaving without choosing pauses sync (TASK-10)", () => {
    const conflict = { key: "space:s:name", kind: "field", field: "name", path: "", name: "Work", local: "Work", server: "Office" } as unknown as Conflict
    useMergeConflict.getState().open([conflict], null, [], [])
    render(<MergeConflictModal />)
    expect(screen.queryByRole("button", { name: "Ignore for now" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Pause sync and decide later" }))
    expect(dismiss).toHaveBeenCalledTimes(1)
  })
})
