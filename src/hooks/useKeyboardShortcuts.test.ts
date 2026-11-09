import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderHook } from "@testing-library/react"
import { useKeyboardShortcuts } from "./useKeyboardShortcuts"
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore"
import { useUIStore } from "~src/store/useUIStore"
import * as yjs from "~src/lib/yjsDoc"
import type { SavedSpace } from "~src/types"

vi.mock("sonner", () => ({ toast: vi.fn() }))
vi.mock("~src/utils/favicon", () => ({ faviconToDataUrl: vi.fn(async (u: string) => u) }))

const tree = (): SavedSpace[] => [
  {
    id: "s1", name: "Work", order: 0,
    projects: [{ id: "p1", name: "Site", order: 0, categories: [{ id: "c1", name: "Research", order: 0, groups: [] }] }],
  },
  { id: "s2", name: "Home", order: 1, projects: [] },
]

const press = (key: string, shift = false, metaKey = true) =>
  document.dispatchEvent(new KeyboardEvent("keydown", { key, metaKey, shiftKey: shift, bubbles: true }))
// The letters fire on their own (TASK-13): Chrome keeps Ctrl/⌘+N for windows.
const letter = (key: string, shift = false) => press(key, shift, false)
const spaces = () => yjs.getSpaces()

beforeEach(async () => {
  vi.clearAllMocks()
  await yjs.clearState()
  yjs.setSpaces(tree())
  useSavedSpacesStore.setState({
    savedSpaces: yjs.getSpaces(),
    activeSpaceId: "s1",
    activeProjectId: "p1",
    activeCategoryId: "c1",
    expandedProjectIds: [],
  })
  useUIStore.setState({ creating: null, leftDrawerOpen: false, namingGroupIn: null })
  renderHook(() => useKeyboardShortcuts())
})

describe("keyboard shortcuts follow the destination policy", () => {
  it("Shift+N asks for a project name instead of creating a placeholder", () => {
    letter("N", true)
    expect(useUIStore.getState().creating).toEqual({ kind: "project", spaceId: "s1" })
    expect(spaces()[0].projects).toHaveLength(1)
  })

  it("N opens the group name row in the current category, without writing a group", () => {
    letter("n")
    expect(useUIStore.getState().namingGroupIn).toBe("c1")
    expect(spaces()[0].projects[0].categories[0].groups).toHaveLength(0)
  })

  it("N in a space without a project opens the name row on the default path", () => {
    useSavedSpacesStore.setState({ activeSpaceId: "s2", activeProjectId: null, activeCategoryId: null })
    letter("n")
    expect(useUIStore.getState().creating).toBeNull()
    const [project] = spaces().find(s => s.id === "s2")!.projects
    expect(project.name).toBe("General")
    expect(project.categories.map(c => c.name)).toEqual(["Uncategorized"])
    const state = useSavedSpacesStore.getState()
    expect([state.activeProjectId, state.activeCategoryId]).toEqual([project.id, project.categories[0].id])
    expect(useUIStore.getState().namingGroupIn).toBe(project.categories[0].id)
    expect(project.categories[0].groups).toHaveLength(0)
  })

  it("N with no spaces creates the default space and opens the name row there (TASK-37)", () => {
    yjs.setSpaces([])
    useSavedSpacesStore.setState({ activeSpaceId: null, activeProjectId: null, activeCategoryId: null })
    letter("n")
    const [space] = spaces()
    expect(space.name).toBe("Personal")
    const state = useSavedSpacesStore.getState()
    expect([state.activeSpaceId, state.activeCategoryId]).toEqual([space.id, space.projects[0].categories[0].id])
    expect(useUIStore.getState().namingGroupIn).toBe(space.projects[0].categories[0].id)
  })

  it("does nothing behind an open modal (TASK-47)", () => {
    const modal = document.createElement("div")
    modal.setAttribute("data-modal", "")
    const button = document.createElement("button")
    modal.appendChild(button)
    document.body.appendChild(modal)
    button.dispatchEvent(new KeyboardEvent("keydown", { key: "n", bubbles: true }))
    button.dispatchEvent(new KeyboardEvent("keydown", { key: "N", shiftKey: true, bubbles: true }))
    expect(useUIStore.getState().namingGroupIn).toBeNull()
    expect(useUIStore.getState().creating).toBeNull()
    modal.remove()
  })

  it("Cmd+Shift+S opens the Save all dialog", () => {
    useUIStore.setState({ saveAllOpen: false })
    press("S", true)
    expect(useUIStore.getState().saveAllOpen).toBe(true)
  })

  it("leaves Cmd/Ctrl+N to the browser", () => {
    press("n")
    press("N", true)
    expect(useUIStore.getState().namingGroupIn).toBeNull()
    expect(useUIStore.getState().creating).toBeNull()
  })

  it("ignores letters while typing in a field", () => {
    const input = document.createElement("input")
    document.body.appendChild(input)
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "n", bubbles: true }))
    expect(useUIStore.getState().namingGroupIn).toBeNull()
    input.remove()
  })

  it("/ focuses search and ? opens the shortcut sheet", () => {
    const search = document.createElement("input")
    search.setAttribute("data-search-input", "")
    document.body.appendChild(search)
    letter("/")
    expect(document.activeElement).toBe(search)
    search.blur(); search.remove()
    useUIStore.setState({ shortcutsOpen: false })
    letter("?", true)
    expect(useUIStore.getState().shortcutsOpen).toBe(true)
  })
})
