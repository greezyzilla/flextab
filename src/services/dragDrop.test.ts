import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  findTabLocation,
  findGroupLocation,
  findSavedDragItem,
  isDropTargetId,
  parseBoundaryDrop,
  parseGroupDroppable,
  applyDragEnd,
  applyContainerDrop,
  categoryDragId,
  containerDropTarget,
  containerMeets,
  containerReorderTarget,
  edgeAt,
  parseContainerDrag,
  projectDragId,
} from "./dragDrop"
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore"
import * as yjs from "~src/lib/yjsDoc"
import { orderedGroups } from "~src/lib/defaultPath"
import type { SavedSpace } from "~src/types"

const tree = (): SavedSpace[] => [
  {
    id: "s1",
    name: "S1",
    order: 0,
    projects: [
      {
        id: "p1",
        name: "P1",
        order: 0,
        categories: [
          {
            id: "c1",
            name: "C1",
            order: 0,
            groups: [
              {
                id: "g1",
                name: "G1",
                order: 0,
                tabs: [
                  { id: "t1", url: "https://a.com", title: "A", favicon: "", order: 0 },
                  { id: "t2", url: "https://b.com", title: "B", favicon: "", order: 1 },
                ],
              },
              {
                id: "g2",
                name: "G2",
                order: 1,
                tabs: [
                  { id: "t3", url: "https://c.com", title: "C", favicon: "", order: 0 },
                ],
              },
            ],
          },
          {
            id: "c2",
            name: "C2",
            order: 1,
            groups: [
              {
                id: "g3",
                name: "G3",
                order: 0,
                tabs: [
                  { id: "t4", url: "https://d.com", title: "D", favicon: "", order: 0 },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "s2",
    name: "S2",
    order: 1,
    projects: [],
  },
]

beforeEach(async () => {
  vi.clearAllMocks()
  await yjs.clearState()
  yjs.setSpaces(tree())
  useSavedSpacesStore.setState({
    savedSpaces: yjs.getSpaces(),
    activeSpaceId: "s1",
    activeProjectId: "p1",
    activeCategoryId: "c1",
  })
})

describe("findTabLocation / findGroupLocation", () => {
  it("finds tab deep in tree", () => {
    expect(findTabLocation(tree(), "t3")).toEqual({
      spaceId: "s1",
      projectId: "p1",
      categoryId: "c1",
      groupId: "g2",
    })
  })

  it("returns null for unknown tab", () => {
    expect(findTabLocation(tree(), "nope")).toBeNull()
  })

  it("finds group location", () => {
    expect(findGroupLocation(tree(), "g3")).toEqual({
      spaceId: "s1",
      projectId: "p1",
      categoryId: "c2",
    })
  })
})

describe("findSavedDragItem", () => {
  it("resolves group before nested tabs of same id scope", () => {
    const { group, tab } = findSavedDragItem(tree(), "g1")
    expect(group?.id).toBe("g1")
    expect(tab).toBeNull()
  })

  it("resolves tab", () => {
    const { group, tab } = findSavedDragItem(tree(), "t2")
    expect(group).toBeNull()
    expect(tab?.id).toBe("t2")
  })
})

describe("drop ID protocol", () => {
  it("isDropTargetId recognizes zone prefixes", () => {
    expect(isDropTargetId("droppable-g1")).toBe(true)
    expect(isDropTargetId("cat-drop:s:p:c")).toBe(true)
    expect(isDropTargetId("section-drop:s:p:c")).toBe(true)
    expect(isDropTargetId("proj-drop:s:p")).toBe(true)
    expect(isDropTargetId("space-drop:s")).toBe(true)
    expect(isDropTargetId("t1")).toBe(false)
  })

  it("parseBoundaryDrop", () => {
    expect(parseBoundaryDrop("cat-drop:s1:p1:c2")).toEqual({
      kind: "category",
      spaceId: "s1",
      projectId: "p1",
      categoryId: "c2",
    })
    expect(parseBoundaryDrop("proj-drop:s1:p1")).toEqual({
      kind: "project",
      spaceId: "s1",
      projectId: "p1",
    })
    expect(parseBoundaryDrop("space-drop:s2")).toEqual({
      kind: "space",
      spaceId: "s2",
    })
    expect(parseBoundaryDrop("section-drop:s1:p1:c2")).toEqual({
      kind: "category",
      spaceId: "s1",
      projectId: "p1",
      categoryId: "c2",
    })
    expect(parseBoundaryDrop("droppable-g1")).toBeNull()
  })

  it("parseGroupDroppable", () => {
    expect(parseGroupDroppable("droppable-g1")).toBe("g1")
    expect(parseGroupDroppable("t1")).toBeNull()
  })
})

describe("applyDragEnd", () => {
  it("reorders tabs within the same group", async () => {
    await applyDragEnd({
      activeId: "t1",
      overId: "t2",
      wasDraggingGroup: false,
    })
    const g1 = yjs
      .getSpaces()[0]
      .projects[0].categories[0].groups.find((g) => g.id === "g1")!
    const ids = [...g1.tabs]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((t) => t.id)
    expect(ids).toEqual(["t2", "t1"])
  })

  it("moves tab between groups in the same category", async () => {
    await applyDragEnd({
      activeId: "t1",
      overId: "droppable-g2",
      wasDraggingGroup: false,
    })
    const c1 = yjs.getSpaces()[0].projects[0].categories[0]
    const g1 = c1.groups.find((g) => g.id === "g1")!
    const g2 = c1.groups.find((g) => g.id === "g2")!
    expect(g1.tabs.map((t) => t.id)).not.toContain("t1")
    expect(g2.tabs.map((t) => t.id)).toContain("t1")
  })

  it("moves group to another category via boundary drop", async () => {
    await applyDragEnd({
      activeId: "g1",
      overId: "cat-drop:s1:p1:c2",
      wasDraggingGroup: true,
    })
    const spaces = yjs.getSpaces()
    const c1 = spaces[0].projects[0].categories.find((c) => c.id === "c1")!
    const c2 = spaces[0].projects[0].categories.find((c) => c.id === "c2")!
    expect(c1.groups.find((g) => g.id === "g1")).toBeUndefined()
    expect(c2.groups.find((g) => g.id === "g1")).toBeTruthy()
  })

  it("leaves a group in place when dropped on a space that no longer exists", async () => {
    const before = JSON.stringify(yjs.getSpaces())
    await applyDragEnd({ activeId: "g1", overId: "space-drop:gone", wasDraggingGroup: true })
    expect(JSON.stringify(yjs.getSpaces())).toBe(before)
  })

  it("saves a tab dropped on an empty space into General › Uncategorized › Unsorted", async () => {
    const result = await applyDragEnd({ activeId: "t1", overId: "space-drop:s2", wasDraggingGroup: false })
    expect(result).toBeUndefined()
    const project = yjs.getSpaces().find((s) => s.id === "s2")!.projects[0]
    expect(project.name).toBe("General")
    expect(project.categories.map((c) => c.name)).toEqual(["Uncategorized"])
    const [unsorted] = project.categories[0].groups
    expect(unsorted).toMatchObject({ name: "Unsorted", config: { kind: "unsorted" } })
    expect(unsorted.tabs.map((t) => t.id)).toEqual(["t1"])
    const g1 = yjs.getSpaces()[0].projects[0].categories[0].groups.find((g) => g.id === "g1")!
    expect(g1.tabs.map((t) => t.id)).not.toContain("t1")
  })

  it("re-files a group into another category section by dropping it on a group there", async () => {
    await applyDragEnd({ activeId: "g1", overId: "g3", wasDraggingGroup: true })
    const c2 = yjs.getSpaces()[0].projects[0].categories.find((c) => c.id === "c2")!
    const ids = [...c2.groups].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((g) => g.id)
    expect(ids).toEqual(["g1", "g3"])
    const c1 = yjs.getSpaces()[0].projects[0].categories.find((c) => c.id === "c1")!
    expect(c1.groups.map((g) => g.id)).toEqual(["g2"])
  })

  it("moves a group into an empty section without creating an extra group", async () => {
    yjs.addCategory("s1", "p1", { id: "c3", name: "C3", order: 2, groups: [] })
    useSavedSpacesStore.setState({ savedSpaces: yjs.getSpaces() })
    await applyDragEnd({ activeId: "g2", overId: "section-drop:s1:p1:c3", wasDraggingGroup: true })
    const c3 = yjs.getSpaces()[0].projects[0].categories.find((c) => c.id === "c3")!
    expect(c3.groups.map((g) => g.id)).toEqual(["g2"])
  })

  it("moves a tab to a group in another category of the project page", async () => {
    await applyDragEnd({ activeId: "t3", overId: "droppable-g3", wasDraggingGroup: false })
    const c2 = yjs.getSpaces()[0].projects[0].categories.find((c) => c.id === "c2")!
    expect(c2.groups[0].tabs.map((t) => t.id)).toEqual(["t4", "t3"])
  })

  it("works on groups outside the active category", async () => {
    useSavedSpacesStore.setState({ activeCategoryId: "c1" })
    await applyDragEnd({ activeId: "t4", overId: "droppable-g1", wasDraggingGroup: false })
    const g1 = yjs.getSpaces()[0].projects[0].categories[0].groups.find((g) => g.id === "g1")!
    expect(g1.tabs.map((t) => t.id)).toContain("t4")
  })

  it("saves an opened browser tab into a group of another category", async () => {
    vi.mocked(chrome.tabs.get).mockResolvedValueOnce({ id: 7, url: "https://e.com", title: "E", favIconUrl: "" } as chrome.tabs.Tab)
    await applyDragEnd({ activeId: 7, overId: "droppable-g3", wasDraggingGroup: false })
    const g3 = yjs.getSpaces()[0].projects[0].categories.find((c) => c.id === "c2")!.groups[0]
    expect(g3.tabs.map((t) => t.url)).toEqual(["https://d.com", "https://e.com"])
  })

  it("tells where a dropped open tab's URL is already saved, and still saves it", async () => {
    vi.mocked(chrome.tabs.get).mockResolvedValueOnce({ id: 9, url: "https://d.com/", title: "D", favIconUrl: "" } as chrome.tabs.Tab)
    const outcome = await applyDragEnd({ activeId: 9, overId: "droppable-g1", wasDraggingGroup: false })
    expect(outcome).toMatchObject({ saved: { alsoIn: ["S1 › P1 › C2 › G3"], closed: [] } })
    const g1 = yjs.getSpaces()[0].projects[0].categories[0].groups.find((g) => g.id === "g1")!
    expect(g1.tabs.map((t) => t.url)).toContain("https://d.com/")
  })

  it("tells where an open tab dropped on a space is already saved", async () => {
    vi.mocked(chrome.tabs.get).mockResolvedValueOnce({ id: 10, url: "https://d.com", title: "D", favIconUrl: "" } as chrome.tabs.Tab)
    const outcome = await applyDragEnd({ activeId: 10, overId: "space-drop:s2", wasDraggingGroup: false })
    expect(outcome).toMatchObject({ saved: { alsoIn: ["S1 › P1 › C2 › G3"], closed: [] } })
  })

  it("closes a dragged-in open tab when 'Close after dragging a tab in' is on; Undo takes the save back and reopens it (TASK-60)", async () => {
    vi.mocked(chrome.storage.local.get).mockImplementation((async (key: string) => (key === "flextab_close_after_drag" ? { [key]: true } : {})) as never)
    const tab = { id: 11, windowId: 4, index: 2, url: "https://z.com", title: "Z", favIconUrl: "" } as chrome.tabs.Tab
    vi.mocked(chrome.tabs.get).mockResolvedValueOnce(tab)
    vi.mocked(chrome.tabs.query).mockResolvedValue([tab, { id: 12 } as chrome.tabs.Tab])
    const outcome = await applyDragEnd({ activeId: 11, overId: "droppable-g1", wasDraggingGroup: false })
    if (!outcome || !("saved" in outcome)) throw new Error("expected a save")
    expect(outcome.saved).toMatchObject({ title: "Z", closed: [{ windowId: 4, index: 2, url: "https://z.com" }] })
    expect(chrome.tabs.remove).toHaveBeenCalledWith([11])
    const g1 = () => yjs.getSpaces()[0].projects[0].categories[0].groups.find((g) => g.id === "g1")!
    expect(g1().tabs.map((t) => t.url)).toContain("https://z.com")
    outcome.saved.undo()
    expect(g1().tabs.map((t) => t.url)).not.toContain("https://z.com")
    await vi.waitFor(() => expect(chrome.tabs.create).toHaveBeenCalledWith({ windowId: 4, index: 2, url: "https://z.com", active: false }))
    vi.mocked(chrome.storage.local.get).mockImplementation((async () => ({})) as never)
  })

  it("saves an opened tab into an empty section's Unsorted", async () => {
    yjs.addCategory("s1", "p1", { id: "c3", name: "C3", order: 2, groups: [] })
    useSavedSpacesStore.setState({ savedSpaces: yjs.getSpaces() })
    vi.mocked(chrome.tabs.get).mockResolvedValueOnce({ id: 8, url: "https://f.com", title: "F", favIconUrl: "" } as chrome.tabs.Tab)
    await applyDragEnd({ activeId: 8, overId: "section-drop:s1:p1:c3", wasDraggingGroup: false })
    const c3 = yjs.getSpaces()[0].projects[0].categories.find((c) => c.id === "c3")!
    expect(c3.groups).toHaveLength(1)
    expect(c3.groups[0]).toMatchObject({ name: "Unsorted", config: { kind: "unsorted" } })
    expect(c3.groups[0].tabs.map((t) => t.url)).toEqual(["https://f.com"])
  })

  it("never drags the Unsorted group itself, and a group dropped on it doesn't reorder", async () => {
    await applyDragEnd({ activeId: "t3", overId: "section-drop:s1:p1:c1", wasDraggingGroup: false })
    const c1 = () => yjs.getSpaces()[0].projects[0].categories.find((c) => c.id === "c1")!
    const unsorted = c1().groups.find((g) => g.config?.kind === "unsorted")!
    expect(unsorted.tabs.map((t) => t.id)).toEqual(["t3"])
    // g2 lost its only tab to Unsorted; it is a user group, so it stays.
    expect(c1().groups.find((g) => g.id === "g2")!.tabs).toEqual([])
    const before = c1().groups.map((g) => [g.id, g.order])
    await applyDragEnd({ activeId: unsorted.id, overId: "g1", wasDraggingGroup: true })
    await applyDragEnd({ activeId: unsorted.id, overId: "proj-drop:s1:p1", wasDraggingGroup: true })
    await applyDragEnd({ activeId: "g2", overId: unsorted.id, wasDraggingGroup: true })
    expect(c1().groups.map((g) => [g.id, g.order])).toEqual(before)
  })

  it("removes Unsorted once its last tab is moved out", async () => {
    await applyDragEnd({ activeId: "t3", overId: "section-drop:s1:p1:c1", wasDraggingGroup: false })
    await applyDragEnd({ activeId: "t3", overId: "droppable-g1", wasDraggingGroup: false })
    const groups = yjs.getSpaces()[0].projects[0].categories.find((c) => c.id === "c1")!.groups
    expect(groups.some((g) => g.config?.kind === "unsorted")).toBe(false)
  })

  it("gives a project without categories its default category on drop", async () => {
    yjs.addProject("s1", { id: "p2", name: "P2", order: 1, categories: [] })
    useSavedSpacesStore.setState({ savedSpaces: yjs.getSpaces() })
    await applyDragEnd({ activeId: "t1", overId: "proj-drop:s1:p2", wasDraggingGroup: false })
    const p2 = () => yjs.getSpaces()[0].projects.find((p) => p.id === "p2")!
    expect(p2().categories.map((c) => c.name)).toEqual(["Uncategorized"])
    expect(p2().categories[0].groups[0].tabs.map((t) => t.id)).toEqual(["t1"])
    // A group needs only the category: no Unsorted is created for it.
    await applyDragEnd({ activeId: "g2", overId: "space-drop:s2", wasDraggingGroup: true })
    const s2 = yjs.getSpaces().find((s) => s.id === "s2")!
    expect(s2.projects[0].categories[0].groups.map((g) => g.id)).toEqual(["g2"])
  })

  it("moves a saved tab next to a tab in another category", async () => {
    await applyDragEnd({ activeId: "t1", overId: "t4", wasDraggingGroup: false })
    const g3 = yjs.getSpaces()[0].projects[0].categories.find((c) => c.id === "c2")!.groups[0]
    const ids = [...g3.tabs].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((t) => t.id)
    expect(ids).toEqual(["t1", "t4"])
  })

  it("refuses an unsavable open tab before creating anything", async () => {
    yjs.addCategory("s1", "p1", { id: "c3", name: "C3", order: 2, groups: [] })
    useSavedSpacesStore.setState({ savedSpaces: yjs.getSpaces() })
    vi.mocked(chrome.tabs.get).mockResolvedValueOnce({ id: 9, url: "chrome-extension://abc/newtab.html", title: "Flextab" } as chrome.tabs.Tab)
    const outcome = await applyDragEnd({ activeId: 9, overId: "section-drop:s1:p1:c3", wasDraggingGroup: false })
    expect(outcome).toEqual({ unsavable: "Flextab" })
    expect(yjs.getSpaces()[0].projects[0].categories.find((c) => c.id === "c3")!.groups).toEqual([])
  })

  it("names an unsavable tab by title, then URL, then a generic label", async () => {
    vi.mocked(chrome.tabs.get)
      .mockResolvedValueOnce({ id: 11, url: "about:blank" } as chrome.tabs.Tab)
      .mockResolvedValueOnce({ id: 12 } as chrome.tabs.Tab)
    expect(await applyDragEnd({ activeId: 11, overId: "droppable-g1", wasDraggingGroup: false })).toEqual({ unsavable: "about:blank" })
    expect(await applyDragEnd({ activeId: 12, overId: "droppable-g1", wasDraggingGroup: false })).toEqual({ unsavable: "This page" })
  })

  it("ignores a drop of an open tab that was closed mid-drag", async () => {
    vi.mocked(chrome.tabs.get).mockRejectedValueOnce(new Error("No tab"))
    expect(await applyDragEnd({ activeId: 10, overId: "droppable-g1", wasDraggingGroup: false })).toBeUndefined()
  })

  it("no-ops when over target missing (caller already guards null over)", async () => {
    await applyDragEnd({
      activeId: "t1",
      overId: "unknown-id",
      wasDraggingGroup: false,
    })
    const g1 = yjs
      .getSpaces()[0]
      .projects[0].categories[0].groups.find((g) => g.id === "g1")!
    expect(g1.tabs.map((t) => t.id)).toEqual(["t1", "t2"])
  })
})

describe("dragging a project or a category (TASK-59)", () => {
  const cat = (id: string) => ({ id, name: id.toUpperCase(), order: 0, groups: [] })
  beforeEach(() => {
    yjs.setSpaces([
      { id: "h", name: "Hobby", order: 0, projects: [{ id: "p1", name: "Test", order: 0, categories: [cat("c1"), cat("c2")] }] },
      { id: "e", name: "Personal", order: 1, projects: [{ id: "p2", name: "Home", order: 0, categories: [cat("c3")] }] },
    ])
    useSavedSpacesStore.setState({ savedSpaces: yjs.getSpaces(), activeSpaceId: "h", activeProjectId: "p1", activeCategoryId: "c1" })
  })
  const project = { kind: "project" as const, spaceId: "h", projectId: "p1" }
  const category = { kind: "category" as const, spaceId: "h", projectId: "p1", categoryId: "c2" }

  it("reads drag ids back, and ignores tabs and groups", () => {
    expect(parseContainerDrag(projectDragId("h", "p1"))).toEqual(project)
    expect(parseContainerDrag(categoryDragId("h", "p1", "c2"))).toEqual(category)
    expect(parseContainerDrag("t1")).toBeNull()
    expect(parseContainerDrag(42)).toBeNull()
  })

  it("takes a project on a space, and a category on a project or category row", () => {
    expect(containerDropTarget(project, "space-drop:e")).toEqual({ spaceId: "e" })
    expect(containerDropTarget(project, "proj-drop:e:p2")).toBeNull()
    expect(containerDropTarget(category, "proj-drop:e:p2")).toEqual({ spaceId: "e", projectId: "p2" })
    expect(containerDropTarget(category, "cat-drop:e:p2:c3")).toEqual({ spaceId: "e", projectId: "p2" })
    expect(containerDropTarget(category, "space-drop:e")).toBeNull()
    expect(containerDropTarget(category, "section-drop:e:p2:c3")).toBeNull()
    expect(containerDropTarget(category, "droppable-g1")).toBeNull()
  })

  it("lets a category meet rail spaces to open them, without landing there", () => {
    expect(containerMeets(category, "space-drop:e")).toBe(true)
    expect(containerMeets(category, "proj-drop:e:p2")).toBe(true)
    expect(containerMeets(category, "droppable-g1")).toBe(false)
    expect(containerMeets(project, "space-drop:e")).toBe(true)
    expect(containerMeets(project, "proj-drop:e:p2")).toBe(false)
    expect(applyContainerDrop(category, "space-drop:e")).toBeNull()
  })

  it("moves the dropped container and returns the Undo toast", () => {
    const moved = applyContainerDrop(category, "cat-drop:e:p2:c3")!
    expect(moved.message).toBe("Moved “C2” to Personal › Home")
    expect(yjs.getSpaces()[1].projects[0].categories.map((c) => c.id)).toEqual(["c3", "c2"])
    moved.undo()
    expect(yjs.getSpaces()[0].projects[0].categories.map((c) => c.id)).toEqual(["c1", "c2"])
    const movedProject = applyContainerDrop(project, "space-drop:e")!
    expect(movedProject.message).toBe("Moved “Test” to Personal")
    expect(yjs.getSpaces()[0].projects).toEqual([])
  })

  it("does nothing on a zone that does not take it, or on its own place", () => {
    expect(applyContainerDrop(project, "proj-drop:e:p2")).toBeNull()
    expect(applyContainerDrop(project, "space-drop:h")).toBeNull()
    expect(applyContainerDrop(category, "cat-drop:h:p1:c1")).toBeNull()
    expect(yjs.getSpaces()[0].projects[0].categories.map((c) => c.id)).toEqual(["c1", "c2"])
  })
})

describe("reordering a project or a category by drag (TASK-64)", () => {
  const cat = (id: string) => ({ id, name: id.toUpperCase(), order: 0, groups: [] })
  beforeEach(() => {
    yjs.setSpaces([
      { id: "h", name: "Hobby", order: 0, projects: [
        { id: "p1", name: "Test", order: 0, categories: [cat("c1"), cat("c2"), cat("c3")] },
        { id: "p2", name: "Games", order: 1, categories: [cat("c4")] },
      ] },
      { id: "e", name: "Personal", order: 1, projects: [{ id: "p3", name: "Home", order: 0, categories: [] }] },
    ])
    useSavedSpacesStore.setState({ savedSpaces: yjs.getSpaces(), activeSpaceId: "h" })
  })
  const project = { kind: "project" as const, spaceId: "h", projectId: "p1" }
  const category = { kind: "category" as const, spaceId: "h", projectId: "p1", categoryId: "c1" }

  it("reorders only next to a row of the same parent", () => {
    expect(containerReorderTarget(project, "proj-drop:h:p2")).toBe("p2")
    expect(containerReorderTarget(project, "proj-drop:h:p1")).toBeNull() // itself
    expect(containerReorderTarget(project, "proj-drop:e:p3")).toBeNull() // another space
    expect(containerReorderTarget(project, "space-drop:e")).toBeNull()
    expect(containerReorderTarget(category, "cat-drop:h:p1:c3")).toBe("c3")
    expect(containerReorderTarget(category, "cat-drop:h:p1:c1")).toBeNull() // itself
    expect(containerReorderTarget(category, "cat-drop:h:p2:c4")).toBeNull() // another project: a move
    expect(containerReorderTarget(category, "section-drop:h:p1:c3")).toBeNull()
    expect(containerReorderTarget(category, "proj-drop:h:p1")).toBeNull()
    expect(containerMeets(project, "proj-drop:h:p2")).toBe(true)
    expect(containerMeets(project, "proj-drop:e:p3")).toBe(false)
  })

  it("puts the line on the half of the row the pointer is over", () => {
    expect(edgeAt({ top: 100, height: 20 }, 105)).toBe("before")
    expect(edgeAt({ top: 100, height: 20 }, 115)).toBe("after")
  })

  it("reorders on drop, says where, and undoes", () => {
    const moved = applyContainerDrop(category, "cat-drop:h:p1:c3", "after")!
    expect(moved.message).toBe("Moved “C1” below “C3”")
    expect(yjs.getSpaces()[0].projects[0].categories.map((c) => c.id)).toEqual(["c2", "c3", "c1"])
    moved.undo()
    expect(yjs.getSpaces()[0].projects[0].categories.map((c) => c.id)).toEqual(["c1", "c2", "c3"])
    const up = applyContainerDrop({ ...project, projectId: "p2" }, "proj-drop:h:p1", "before")!
    expect(up.message).toBe("Moved “Games” above “Test”")
    expect(yjs.getSpaces()[0].projects.map((p) => p.id)).toEqual(["p2", "p1"])
    expect(applyContainerDrop(project, "proj-drop:h:p2", "after")).toBeNull() // Test is already below Games
  })

  it("still moves a category dropped on a category of another project (TASK-59)", () => {
    const moved = applyContainerDrop(category, "cat-drop:h:p2:c4")!
    expect(moved.message).toBe("Moved “C1” to Hobby › Games")
  })
})

describe("indexes are shown positions, even when stored order differs (TASK-64)", () => {
  const shownGroups = () => orderedGroups(yjs.getSpaces()[0].projects[0].categories[0].groups).map((g) => g.id).join("")
  const seed = (groups: any[]) => {
    yjs.setSpaces([{ id: "s", name: "S", order: 0, projects: [{ id: "p", name: "P", order: 0, categories: [{ id: "c", name: "C", order: 0, groups }] }] }])
    useSavedSpacesStore.setState({ savedSpaces: yjs.getSpaces() })
  }

  it("reorders the dragged group after a group was created at the top", async () => {
    seed([{ id: "A", name: "A", order: 0, tabs: [] }, { id: "B", name: "B", order: 1, tabs: [] }])
    useSavedSpacesStore.getState().addSavedGroup("s", "p", "c", { id: "N", name: "N", order: -1, tabs: [] }) // stored last, shown first
    expect(shownGroups()).toBe("NAB")
    await applyDragEnd({ activeId: "B", overId: "A", wasDraggingGroup: true })
    expect(shownGroups()).toBe("NBA") // was "ANB": the new group moved instead
  })

  it("moves a tab next to the tab it was dropped on when stored order differs", async () => {
    seed([
      { id: "g1", name: "G1", order: 0, tabs: [{ id: "x", url: "https://x.test", title: "X", favicon: "", order: 0 }] },
      { id: "g2", name: "G2", order: 1, tabs: [
        { id: "b", url: "https://b.test", title: "B", favicon: "", order: 1 },
        { id: "a", url: "https://a.test", title: "A", favicon: "", order: 0 }, // stored second, shown first
      ] },
    ])
    await applyDragEnd({ activeId: "x", overId: "b", wasDraggingGroup: false })
    const g2 = yjs.getSpaces()[0].projects[0].categories[0].groups.find((g) => g.id === "g2")!
    expect([...g2.tabs].sort((p, q) => (p.order ?? 0) - (q.order ?? 0)).map((t) => t.id)).toEqual(["a", "x", "b"])
  })

  it("keeps the shown order of a category a group leaves", async () => {
    yjs.setSpaces([{ id: "s", name: "S", order: 0, projects: [{ id: "p", name: "P", order: 0, categories: [
      { id: "c", name: "C", order: 0, groups: [{ id: "A", name: "A", order: 0, tabs: [] }, { id: "B", name: "B", order: 1, tabs: [] }, { id: "N", name: "N", order: -1, tabs: [] }] },
      { id: "d", name: "D", order: 1, groups: [] },
    ] }] }])
    useSavedSpacesStore.setState({ savedSpaces: yjs.getSpaces() })
    useSavedSpacesStore.getState().moveGroupToCategory("s", "p", "c", "B", "s", "p", "d")
    expect(shownGroups()).toBe("NA") // was "AN"
  })
})
