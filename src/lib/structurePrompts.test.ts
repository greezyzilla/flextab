import { beforeEach, describe, expect, it, vi } from "vitest"
import { requestMissingLevel } from "./structurePrompts"
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore"
import { useUIStore } from "~src/store/useUIStore"
import * as yjs from "~src/lib/yjsDoc"

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }))
vi.mock("sonner", () => ({ toast }))

beforeEach(async () => {
  vi.clearAllMocks()
  await yjs.clearState()
  yjs.setSpaces([
    { id: "s1", name: "Work", order: 0, projects: [{ id: "p1", name: "Site", order: 0, categories: [] }] },
    { id: "s2", name: "Home", order: 1, projects: [] },
  ])
  useSavedSpacesStore.setState({
    savedSpaces: yjs.getSpaces(),
    activeSpaceId: "s2",
    activeProjectId: null,
    activeCategoryId: null,
    expandedProjectIds: [],
  })
  useUIStore.setState({ creating: null })
})

describe("requestMissingLevel", () => {
  it("asks for a project in the target space and carries the continuation", () => {
    const then = vi.fn()
    useSavedSpacesStore.setState({ activeSpaceId: "s1" })
    requestMissingLevel({ missing: "project", spaceId: "s2" }, then)
    expect(useSavedSpacesStore.getState().activeSpaceId).toBe("s2")
    expect(useUIStore.getState().creating).toEqual({ kind: "project", spaceId: "s2", then })
    expect(toast).toHaveBeenCalledWith("Name a project in Home", expect.anything())
  })

  it("asks for a category, selecting and expanding its project", () => {
    requestMissingLevel({ missing: "category", spaceId: "s1", projectId: "p1" })
    const state = useSavedSpacesStore.getState()
    expect(state.activeSpaceId).toBe("s1")
    expect(state.activeProjectId).toBe("p1")
    expect(state.expandedProjectIds).toContain("p1")
    expect(useUIStore.getState().creating).toEqual({ kind: "category", spaceId: "s1", projectId: "p1", then: undefined })
    expect(toast).toHaveBeenCalledWith("Name a category in Site", expect.anything())
  })

  it("ignores unknown spaces and projects", () => {
    requestMissingLevel({ missing: "project", spaceId: "nope" })
    requestMissingLevel({ missing: "category", spaceId: "s1", projectId: "nope" })
    expect(useUIStore.getState().creating).toBeNull()
  })
})
