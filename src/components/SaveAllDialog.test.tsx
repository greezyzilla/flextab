import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { SaveAllDialog } from "./SaveAllDialog"
import { useUIStore } from "~src/store/useUIStore"
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore"
import * as yjs from "~src/lib/yjsDoc"
import type { SavedSpace } from "~src/types"

const { undoToast } = vi.hoisted(() => ({ undoToast: vi.fn() }))
vi.mock("~src/components/ui/sonner", () => ({ showUndoToast: undoToast }))
vi.mock("~src/utils/favicon", () => ({ faviconToDataUrl: vi.fn(async (u: string) => u) }))

const tree = (): SavedSpace[] => [{ id: "s", name: "Work", order: 0, projects: [{ id: "p", name: "Site", order: 0,
  categories: [{ id: "c", name: "Research", order: 0, groups: [] }] }] }]
const groups = () => yjs.getSpaces()[0].projects[0].categories[0].groups
let disk: Record<string, unknown>

beforeEach(async () => {
  vi.clearAllMocks()
  disk = {}
  vi.mocked(chrome.storage.local.get).mockImplementation((async (key: string) => (key in disk ? { [key]: disk[key] } : {})) as never)
  vi.mocked(chrome.storage.local.set).mockImplementation((async (items: Record<string, unknown>) => { Object.assign(disk, items) }) as never)
  await yjs.clearState()
  yjs.setSpaces(tree())
  useSavedSpacesStore.setState({ savedSpaces: yjs.getSpaces(), activeSpaceId: "s", activeProjectId: "p", activeCategoryId: "c" })
  vi.mocked(chrome.windows.getAll).mockResolvedValue([
    { id: 1, tabs: [{ id: 11, windowId: 1, index: 0, url: "https://a.example" }, { id: 12, windowId: 1, index: 1, url: "chrome://newtab" }] },
    { id: 2, tabs: [{ id: 21, windowId: 2, index: 0, url: "https://b.example" }, { id: 22, windowId: 2, index: 1, url: "https://c.example" }] },
  ] as chrome.windows.Window[])
  vi.mocked(chrome.windows.getCurrent).mockResolvedValue({ id: 1 } as chrome.windows.Window)
  vi.mocked(chrome.tabs.query).mockResolvedValue([{ id: 99 }, { id: 98 }, { id: 97 }] as chrome.tabs.Tab[])
  useUIStore.setState({ saveAllOpen: true })
})

describe("SaveAllDialog", () => {
  it("previews counts and saves just this window by default", async () => {
    render(<SaveAllDialog />)
    expect(await screen.findByText("3 tabs open in 2 windows.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Save 1 tab" }))
    await waitFor(() => expect(useUIStore.getState().saveAllOpen).toBe(false))
    expect(groups()).toHaveLength(1)
    expect(groups()[0].name).toMatch(/^Window /)
    expect(groups()[0].tabs.map(t => t.url)).toEqual(["https://a.example"])
    expect(undoToast).toHaveBeenCalledWith("Saved 1 tab to Work › Site › Research", expect.any(Function))
    await undoToast.mock.calls[0][1]()
    await waitFor(() => expect(groups()).toHaveLength(0))
  })

  it("saves every window as its own group and closes them when asked", async () => {
    render(<SaveAllDialog />)
    await screen.findByText("3 tabs open in 2 windows.")
    fireEvent.click(screen.getByRole("radio", { name: /All windows/ }))
    fireEvent.click(screen.getByRole("switch", { name: "Close tabs after saving" }))
    fireEvent.click(screen.getByRole("button", { name: "Save 3 tabs" }))
    await waitFor(() => expect(groups()).toHaveLength(2))
    expect(groups().map(g => g.tabs.length)).toEqual([1, 2])
    expect(groups()[1].name).toMatch(/\(2\)$/)
    expect(chrome.tabs.remove).toHaveBeenCalledWith([11])
    expect(chrome.tabs.remove).toHaveBeenCalledWith([21, 22])
    expect(disk.flextab_close_after_save).toBe(true)
  })

  it("starts from all windows when this window has nothing to save", async () => {
    vi.mocked(chrome.windows.getCurrent).mockResolvedValue({ id: 3 } as chrome.windows.Window)
    render(<SaveAllDialog />)
    expect(await screen.findByRole("button", { name: "Save 3 tabs" })).toBeEnabled()
    expect(screen.getByRole("radio", { name: /All windows/ })).toBeChecked()
  })

  it("explains when nothing can be saved", async () => {
    vi.mocked(chrome.windows.getAll).mockResolvedValue([{ id: 1, tabs: [{ url: "chrome://newtab" }] }] as chrome.windows.Window[])
    render(<SaveAllDialog />)
    expect(await screen.findByText(/No savable tabs are open/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Save 0 tabs" })).toBeDisabled()
  })
})
