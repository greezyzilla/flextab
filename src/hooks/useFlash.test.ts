import { afterEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"
import { useFlash } from "./useFlash"
import { useUIStore } from "~src/store/useUIStore"
import { revealInWorkspace } from "~src/services/reveal"
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore"

afterEach(() => vi.useRealTimers())

describe("useFlash / revealInWorkspace", () => {
  it("outlines only the revealed item for a moment, after the scroll settles", () => {
    vi.useFakeTimers()
    const el = document.createElement("div"); el.scrollIntoView = vi.fn()
    const mine = renderHook(() => useFlash<HTMLDivElement>("tab", "t1"))
    const other = renderHook(() => useFlash<HTMLDivElement>("tab", "t2"))
    mine.result.current.ref.current = el
    act(() => useUIStore.getState().flash("tab", "t1"))
    expect(mine.result.current.on).toBe(false)
    act(() => vi.advanceTimersByTime(400))
    expect(mine.result.current.on).toBe(true)
    expect(el.scrollIntoView).toHaveBeenCalled()
    expect(other.result.current.on).toBe(false)
    act(() => vi.advanceTimersByTime(2100))
    expect(mine.result.current.on).toBe(false)
  })

  it("walks to the place from settings too", () => {
    useSavedSpacesStore.setState({
      savedSpaces: [{ id: "s", name: "S", projects: [{ id: "p", name: "P", categories: [{ id: "c", name: "C", groups: [] }] }] }],
      activeSpaceId: null, activeProjectId: null, activeCategoryId: null, expandedProjectIds: ["p"],
    })
    window.location.hash = "#/settings/backup"
    revealInWorkspace({ spaceId: "s", projectId: "p", categoryId: "c" })
    expect(window.location.hash).toBe("#/")
    const s = useSavedSpacesStore.getState()
    expect([s.activeSpaceId, s.activeProjectId, s.activeCategoryId, s.expandedProjectIds]).toEqual(["s", "p", "c", ["p"]])
    expect(useUIStore.getState().scrollTarget).toMatchObject({ categoryId: "c", mode: "top" })
    // Already there: nothing is re-selected or collapsed.
    revealInWorkspace({ spaceId: "s", projectId: "p", categoryId: "c" })
    expect(useSavedSpacesStore.getState().expandedProjectIds).toEqual(["p"])
    revealInWorkspace({ spaceId: "s" })
    expect(useSavedSpacesStore.getState().activeSpaceId).toBe("s")
  })
})
