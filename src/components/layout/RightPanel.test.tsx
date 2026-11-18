import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { DndContext } from "@dnd-kit/core"
import { TooltipProvider } from "~src/components/ui/tooltip"
import { RightPanel } from "./RightPanel"
import { useOpenTabPreview } from "~src/store/useOpenTabPreview"

const tabs = [
  { id: 1, windowId: 9, index: 0, title: "FlexTab", url: "chrome-extension://x/newtab.html" },
  { id: 2, windowId: 9, index: 1, title: "Docs", url: "https://docs.example" },
  { id: 3, windowId: 9, index: 2, title: "News", url: "https://news.example" },
  { id: 4, windowId: 9, index: 3, title: "Version", url: "chrome://version" },
  { id: 5, windowId: 9, index: 4, title: "Pinned", url: "https://pinned.example", pinned: true },
  { id: 6, windowId: 9, index: 5, title: "Flextab", url: "chrome-extension://test/newtab.html#/settings" },
  { id: 7, windowId: 9, index: 6, title: "about:blank", url: "about:blank" },
  { id: 8, windowId: 9, index: 7, title: "slow.example/page", url: "https://slow.example/page", status: "loading" },
] as chrome.tabs.Tab[]

const lone = [{ id: 20, windowId: 10, index: 0, title: "Lone", url: "https://lone.example" }] as chrome.tabs.Tab[]
vi.mock("~src/hooks/useWindows", () => ({ useWindows: () => ({ windows: [{ id: 9, tabs }, { id: 10, tabs: lone }], loading: false, error: null }) }))
const saved = { spaceId: "s", projectId: "p", categoryId: "c", groupId: "g", path: "Work › Launch › Research › Competitors" }
vi.mock("~src/hooks/useSavedUrlIndex", () => ({ useSavedUrlIndex: () => new Map([["https://docs.example/", [saved]], ["https://docs.example", [saved]]]) }))
const { reveal, undo } = vi.hoisted(() => ({ reveal: vi.fn(), undo: vi.fn() }))
vi.mock("~src/services/reveal", () => ({ revealInWorkspace: reveal }))
vi.mock("~src/components/ui/sonner", () => ({ showUndoToast: undo }))
const cap = vi.hoisted(() => ({
  captureTabs: vi.fn(),
  closeSavedTabs: vi.fn(async (t: chrome.tabs.Tab[]) => t.map((x) => ({ windowId: x.windowId!, index: x.index!, url: x.url! }))),
  loadCloseAfter: vi.fn(async () => false),
  loadDefaultDestination: vi.fn(async () => ({ spaceId: "s", projectId: "p", categoryId: "c" })),
  reopenTabs: vi.fn(async () => {}),
  undoCapture: vi.fn(async () => {}),
}))
vi.mock("~src/services/capture", async (orig) => ({ ...(await orig<typeof import("~src/services/capture")>()), ...cap }))

const renderPanel = () => render(<TooltipProvider><DndContext><RightPanel /></DndContext></TooltipProvider>)
const row = (name: string) => screen.getByRole("button", { name: `Go to ${name}` }).parentElement as HTMLElement

beforeEach(() => {
  vi.clearAllMocks()
  cap.loadCloseAfter.mockResolvedValue(false)
  cap.captureTabs.mockResolvedValue({ tabIds: ["n"], target: { spaceId: "s", projectId: "p", categoryId: "c", groupId: "g" }, closed: [], alsoIn: [], persisted: true })
  ;(chrome.tabs as unknown as { getCurrent: () => Promise<chrome.tabs.Tab> }).getCurrent = vi.fn(async () => tabs[0])
})

describe("an open tab dragged in Opened Tabs (TASK-73)", () => {
  it("shows the tab where it would land, the rows around it making room", async () => {
    useOpenTabPreview.getState().show({ tabId: 20, from: { windowId: 10, index: 0 }, slot: { windowId: 9, index: 2 }, label: "Window 1" })
    renderPanel()
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Go to FlexTab" })).toHaveLength(1))
    const order = screen.getAllByRole("button", { name: /^Go to / }).map((b) => b.getAttribute("aria-label"))
    expect(order.slice(0, 3)).toEqual(["Go to Docs", "Go to Lone", "Go to News"])
    expect(screen.getByText("Window 1").parentElement!.textContent).toContain("8 tabs") // counted as it will be
    act(() => useOpenTabPreview.getState().show(null))
    expect(screen.getAllByRole("button", { name: /^Go to / }).map((b) => b.getAttribute("aria-label")).at(-1)).toBe("Go to Lone")
  })
})

describe("Opened Tabs rows (TASK-60)", () => {
  it("leaves out the tab FlexTab runs in; a page that can't be saved can't be saved, but can be moved (TASK-73)", async () => {
    renderPanel()
    // The tab this page runs in is gone; another FlexTab page stays listed.
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Go to FlexTab" })).toHaveLength(1))
    expect(screen.getByRole("button", { name: "Go to FlexTab" }).parentElement!.textContent).not.toContain("x/newtab")
    const version = row("Version")
    expect(within(version).getByRole("button", { name: "Drag Version" })).toBeInTheDocument()
    expect(within(version).queryByRole("button", { name: /^Save/ })).not.toBeInTheDocument()
    expect(within(version).getByRole("button", { name: "Close Version" })).toBeInTheDocument()
    expect(within(row("News")).getByRole("button", { name: "Drag News" })).toBeInTheDocument()
  })

  it("saves in one click to the default place, and closes too when the setting says so, with Undo", async () => {
    renderPanel()
    await act(async () => { fireEvent.click(within(row("News")).getByRole("button", { name: "Save News" })) })
    expect(cap.captureTabs).toHaveBeenCalledWith([tabs[2]], { spaceId: "s", projectId: "p", categoryId: "c" }, { dedupe: true })
    expect(cap.closeSavedTabs).not.toHaveBeenCalled()
    expect(undo).toHaveBeenLastCalledWith("Saved “News”", expect.any(Function), 5000, undefined)
    cap.loadCloseAfter.mockResolvedValue(true)
    await act(async () => { fireEvent.click(within(row("News")).getByRole("button", { name: /^Save/ })) })
    expect(cap.closeSavedTabs).toHaveBeenCalledWith([tabs[2]])
    expect(undo).toHaveBeenLastCalledWith("Saved and closed “News”", expect.any(Function), 5000, undefined)
    await act(async () => { (undo.mock.calls.at(-1)![1] as () => void)() })
    expect(cap.undoCapture).toHaveBeenCalledWith(expect.objectContaining({ closed: [{ windowId: 9, index: 2, url: "https://news.example" }] }))
  })

  it("names the save by what it will do; a pinned tab is never closed, so it just says Save", async () => {
    cap.loadCloseAfter.mockResolvedValue(true)
    renderPanel()
    expect(await within(row("News")).findByRole("button", { name: "Save and close News" })).toBeInTheDocument()
    expect(within(row("Pinned")).getByRole("button", { name: "Save Pinned" })).toBeInTheDocument()
  })

  it("says when a save can't happen or is already there", async () => {
    renderPanel()
    cap.captureTabs.mockResolvedValueOnce({ error: "nothing-savable", skipped: 1 })
    await act(async () => { fireEvent.click(within(row("News")).getByRole("button", { name: "Save News" })) })
    cap.captureTabs.mockResolvedValueOnce({ tabIds: [], target: {}, closed: [], duplicates: 1, persisted: true })
    await act(async () => { fireEvent.click(within(row("News")).getByRole("button", { name: "Save News" })) })
    expect(undo).not.toHaveBeenCalled()
  })

  it("closes a tab in one click, and Undo reopens it where it was", async () => {
    renderPanel()
    await act(async () => { fireEvent.click(within(row("Version")).getByRole("button", { name: "Close Version" })) })
    expect(chrome.tabs.remove).toHaveBeenCalledWith(4)
    expect(undo).toHaveBeenLastCalledWith("Closed “Version”", expect.any(Function))
    await act(async () => { (undo.mock.calls.at(-1)![1] as () => void)() })
    expect(cap.reopenTabs).toHaveBeenCalledWith([{ windowId: 9, index: 3, url: "chrome://version" }])
  })

  it("names a FlexTab page FlexTab and shows no machine address; an address that repeats the title isn't shown twice", async () => {
    renderPanel()
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Go to FlexTab" })).toHaveLength(1))
    const flex = row("FlexTab")
    expect(flex.textContent).toBe("FlexTab")
    expect(within(flex).queryByText(/chrome-extension/)).not.toBeInTheDocument()
    expect(row("about:blank").textContent).toBe("about:blank")
    expect(row("slow.example/page").textContent).toBe("slow.example/page")
    expect(row("News").textContent).toContain("news.example")
  })

  it("marks a loading tab; a page that can't be saved reads quieter", async () => {
    renderPanel()
    expect(within(row("slow.example/page").parentElement!).getByLabelText("Loading")).toBeInTheDocument()
    expect(within(row("Version")).getByText("Version").className).toContain("text-fg-subtle")
    expect(within(row("News")).getByText("News").className).toContain("text-fg ")
  })

  it("counts a window's tabs in words that fit, and saves a window with the same mark as a row", async () => {
    renderPanel()
    expect(screen.getByText("1 tab")).toBeInTheDocument()
    expect(await screen.findByText("7 tabs")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Save Window 2 as a group" }).querySelector("svg.lucide-bookmark-plus")).not.toBeNull()
    // Windows after the first are set apart by a line.
    const sections = screen.getByRole("button", { name: "Save Window 2 as a group" }).closest(".border-t")
    expect(sections).not.toBeNull()
    expect(screen.getByRole("button", { name: "Save Window 1 as a group" }).closest(".border-t")).toBeNull()
  })

  it("a saved tab carries a flag that does nothing; showing it in the workspace is an action; the row goes to the tab", async () => {
    renderPanel()
    const flag = within(row("Docs")).getByRole("img", { name: /^Saved in [^.]*$/ })
    expect(flag.closest("button")).toBeNull()
    expect(within(row("News")).queryByRole("img", { name: /^Saved in / })).not.toBeInTheDocument()
    fireEvent.click(within(row("Docs")).getByRole("button", { name: /Saved in .*\. Show in workspace/ }))
    expect(reveal).toHaveBeenCalledWith({ spaceId: "s", projectId: "p", categoryId: "c", flash: { kind: "group", id: "g" } })
    fireEvent.click(screen.getByRole("button", { name: "Go to Docs" }))
    expect(chrome.tabs.update).toHaveBeenCalledWith(2, { active: true })
    expect(chrome.windows.update).toHaveBeenCalledWith(9, { focused: true })
  })
})
