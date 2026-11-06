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

const press = (key: string, shift = false) =>
  document.dispatchEvent(new KeyboardEvent("keydown", { key, metaKey: true, shiftKey: shift, bubbles: true }))
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
  useUIStore.setState({ creating: null, leftDrawerOpen: false })
  renderHook(() => useKeyboardShortcuts())
})

describe("keyboard shortcuts follow the destination policy", () => {
  it("Cmd+Shift+N asks for a project name instead of creating a placeholder", () => {
    press("N", true)
    expect(useUIStore.getState().creating).toEqual({ kind: "project", spaceId: "s1" })
    expect(spaces()[0].projects).toHaveLength(1)
  })

  it("Cmd+N adds a group to the current category", () => {
    press("n")
    const groups = spaces()[0].projects[0].categories[0].groups
    expect(groups).toHaveLength(1)
    expect(groups[0].name).toBe("New Group")
  })

  it("Cmd+N in a space without a project asks for one and finishes afterwards", () => {
    useSavedSpacesStore.setState({ activeSpaceId: "s2", activeProjectId: null, activeCategoryId: null })
    press("n")
    const req = useUIStore.getState().creating
    expect(req).toMatchObject({ kind: "project", spaceId: "s2" })
    expect(spaces().find(s => s.id === "s2")!.projects).toEqual([])

    // The user names the project and its first category; the shortcut then completes.
    yjs.addProject("s2", { id: "p2", name: "Chores", order: 0, categories: [] })
    yjs.addCategory("s2", "p2", { id: "c2", name: "Bills", order: 0, groups: [] })
    useSavedSpacesStore.setState({ savedSpaces: yjs.getSpaces(), activeSpaceId: "s2", activeProjectId: "p2", activeCategoryId: "c2" })
    req!.then!()
    expect(spaces().find(s => s.id === "s2")!.projects[0].categories[0].groups).toHaveLength(1)
  })

  it("Cmd+Shift+S opens the Save all dialog", () => {
    useUIStore.setState({ saveAllOpen: false })
    press("S", true)
    expect(useUIStore.getState().saveAllOpen).toBe(true)
  })
})
