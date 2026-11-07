import { describe, expect, it } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { SyncConflictModal } from "./SyncConflictModal"
import { useSyncConflict } from "~src/store/useSyncConflict"
import type { SavedSpace } from "~src/types"

const space = (id: string, tabs: number): SavedSpace => ({
  id, name: id, order: 0,
  projects: [{ id: id + "p", name: "P", order: 0, categories: [{ id: id + "c", name: "C", order: 0,
    groups: [{ id: id + "g", name: "G", order: 0, tabs: Array.from({ length: tabs }, (_, i) => ({ id: `${id}${i}`, url: "https://a.example", title: "A", favicon: "", order: i })) }] }] }],
})

describe("SyncConflictModal", () => {
  it("offers only upload or start empty when the account is empty (TASK-11)", () => {
    useSyncConflict.getState().open([], [space("kept", 2)])
    render(<SyncConflictModal />)
    expect(screen.getByRole("alertdialog")).toHaveTextContent("tabs from an earlier sign-in")
    expect(screen.getAllByRole("radio")).toHaveLength(2)
    expect(screen.getByRole("radio", { name: /Add this device's tabs to this account/ })).toBeChecked()
    fireEvent.click(screen.getByRole("radio", { name: /Start with an empty account/ }))
    expect(screen.getByText("The tabs on this device are removed. The workspace starts empty.")).toBeInTheDocument()
    useSyncConflict.getState().close()
  })

  it("keeps the three choices when both sides hold tabs", () => {
    useSyncConflict.getState().open([space("account", 1)], [space("device", 1)])
    render(<SyncConflictModal />)
    expect(screen.getAllByRole("radio")).toHaveLength(3)
    expect(screen.getByRole("radio", { name: /Merge both/ })).toBeChecked()
    useSyncConflict.getState().close()
  })
})
