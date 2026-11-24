import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { DndContext } from "@dnd-kit/core"
import { ProfilePanel } from "./ProfilePanel"
import { TooltipProvider } from "~src/components/ui/tooltip"
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore"
import { useDropIndicator } from "~src/store/useDropIndicator"
import { DragOverlayContent } from "~src/components/dnd/DragOverlayContent"
import * as yjs from "~src/lib/yjsDoc"
import { useUIStore } from "~src/store/useUIStore"

// Rail spaces reorder by drag; a click still switches.
const spaces = [
  { id: "a", name: "Alpha", order: 0, projects: [] },
  { id: "b", name: "Beta", order: 1, projects: [], color: "#ff0000" },
]

beforeEach(() => {
  yjs.setSpaces(spaces)
  useSavedSpacesStore.setState({ savedSpaces: yjs.getSpaces(), activeSpaceId: "a" })
  useDropIndicator.getState().show(null, null)
})

const renderRail = (onDragStart = vi.fn()) => {
  render(<DndContext onDragStart={onDragStart}><TooltipProvider><ProfilePanel /></TooltipProvider></DndContext>)
  return onDragStart
}

describe("rail spaces", () => {
  it("a click, or a press that barely moves, switches space without dragging", () => {
    const onDragStart = renderRail()
    const beta = screen.getByRole("button", { name: "Switch to Beta" })
    fireEvent.pointerDown(beta, { button: 0, clientX: 10, clientY: 10, isPrimary: true })
    fireEvent.pointerMove(window, { clientX: 12, clientY: 11 })
    fireEvent.pointerUp(window)
    fireEvent.click(beta)
    expect(useSavedSpacesStore.getState().activeSpaceId).toBe("b")
    expect(onDragStart).not.toHaveBeenCalled()
    fireEvent.pointerDown(beta, { button: 2, clientX: 10, clientY: 10 }) // not the main button
    fireEvent.pointerMove(window, { clientX: 40, clientY: 40 })
    expect(onDragStart).not.toHaveBeenCalled()
  })

  it("a press that moves starts dragging that space, and the click that may follow does not switch", () => {
    const onDragStart = renderRail()
    const beta = screen.getByRole("button", { name: "Switch to Beta" })
    fireEvent.pointerDown(beta, { button: 0, clientX: 10, clientY: 10, isPrimary: true })
    fireEvent.pointerMove(window, { clientX: 10, clientY: 30 })
    expect(onDragStart).toHaveBeenCalledWith(expect.objectContaining({ active: expect.objectContaining({ id: "space-drag:b" }) }))
    fireEvent.pointerUp(document)
    fireEvent.click(beta)
    expect(useSavedSpacesStore.getState().activeSpaceId).toBe("a")
  })

  it("while a space is dragged its own slot dims, nothing draws a line, and no avatar offers to take it in", () => {
    renderRail()
    const beta = screen.getByRole("button", { name: "Switch to Beta" })
    fireEvent.pointerDown(beta, { button: 0, clientX: 10, clientY: 10, isPrimary: true })
    fireEvent.pointerMove(window, { clientX: 10, clientY: 30 })
    expect((beta.parentElement as HTMLElement).style.opacity).toBe("0.5")
    expect(document.querySelector("[data-insert-line]")).toBeNull()
    expect(document.querySelector(".scale-110")).toBeNull()
    fireEvent.pointerUp(document)
  })

  it("a dragged space travels as a copy of its own avatar", () => {
    render(<DndContext><DragOverlayContent activeId="space-drag:b" draggedGroup={null} draggedTab={null} draggedSavedTab={null}
      draggedContainer={{ kind: "space", spaceId: "b", name: "Beta" }} /></DndContext>)
    const copy = document.querySelector('[data-dragged-space="b"]')!
    expect(copy.textContent).toBe("BE")
    expect(copy.className).toContain("shadow-lg")
    expect(copy.firstElementChild!.className).not.toContain("ring-2") // Beta is not the open space
    render(<DndContext><DragOverlayContent activeId="space-drag:a" draggedGroup={null} draggedTab={null} draggedSavedTab={null}
      draggedContainer={{ kind: "space", spaceId: "a", name: "Alpha" }} /></DndContext>)
    expect(document.querySelector('[data-dragged-space="a"]')!.firstElementChild!.className).toContain("ring-2")
  })
})

describe("Add space by keyboard", () => {
  it("Alt+N opens the rail's name field, focused; Enter creates and selects the space, Esc creates nothing", () => {
    renderRail()
    act(() => useUIStore.getState().requestSpaceNaming())
    const field = screen.getByRole("textbox", { name: "New space name" })
    expect(field).toHaveFocus()
    // Enter/Esc is read to screen readers, never printed.
    expect(field).toHaveAttribute("aria-description", "Enter to create, Escape to cancel")
    expect(screen.queryByText(/Enter to create/)).toBeNull()
    fireEvent.keyDown(field, { key: "Escape" })
    expect(screen.queryByRole("textbox", { name: "New space name" })).toBeNull()
    expect(useSavedSpacesStore.getState().savedSpaces).toHaveLength(2)
    act(() => useUIStore.getState().requestSpaceNaming())
    const again = screen.getByRole("textbox", { name: "New space name" })
    fireEvent.change(again, { target: { value: "Gamma" } })
    fireEvent.keyDown(again, { key: "Enter" })
    const created = useSavedSpacesStore.getState().savedSpaces.find(s => s.name === "Gamma")
    expect(created).toBeTruthy()
    // Opens on its General › Uncategorized, ready to save.
    const { activeSpaceId, activeProjectId, activeCategoryId } = useSavedSpacesStore.getState()
    expect(activeSpaceId).toBe(created!.id)
    expect(created!.projects.map(p => p.name)).toEqual(["General"])
    expect(activeProjectId).toBe(created!.projects[0].id)
    expect(activeCategoryId).toBe(created!.projects[0].categories[0].id)
    expect(created!.projects[0].categories[0]).toMatchObject({ name: "Uncategorized", groups: [] })
  })

  it("leaves the request to the empty workspace's New space entry when there are no spaces", () => {
    yjs.setSpaces([])
    useSavedSpacesStore.setState({ savedSpaces: [], activeSpaceId: null })
    renderRail()
    act(() => useUIStore.getState().requestSpaceNaming())
    expect(screen.queryByRole("textbox", { name: "New space name" })).toBeNull()
  })
})

