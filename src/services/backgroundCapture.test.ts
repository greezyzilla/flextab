import { beforeEach, describe, expect, it, vi } from "vitest"
import * as yjs from "~src/lib/yjsDoc"
import type { SavedSpace } from "~src/types"
import { resetWorkerHydration } from "./capture"
import {
  captureFromBackground, registerCaptureMenus, menuKind, commandKind,
  MENU_SAVE_PAGE, MENU_SAVE_LINK, MENU_SAVE_WINDOW,
} from "./backgroundCapture"

const { loadTokens } = vi.hoisted(() => ({ loadTokens: vi.fn(async () => ({ access_token: "t" }) as unknown) }))
vi.mock("~src/services/api", () => ({ loadTokens }))
vi.mock("~src/utils/favicon", () => ({ faviconToDataUrl: vi.fn(async (u: string) => u) }))

const tree = (): SavedSpace[] => [{
  id: "s", name: "Work", order: 0,
  projects: [{ id: "p", name: "Site", order: 0, categories: [{ id: "c", name: "Research", order: 0, groups: [
    { id: "g", name: "Reading", order: 0, tabs: [] },
  ] }] }],
}]
let disk: Record<string, unknown>
const stored = () => yjs.decodeSpacesFromStorage(disk[yjs.PERSIST_KEY])[0].projects[0].categories[0].groups

beforeEach(async () => {
  vi.clearAllMocks()
  vi.useRealTimers()
  disk = {}
  vi.mocked(chrome.storage.local.get).mockImplementation((async (key: string) => (key in disk ? { [key]: disk[key] } : {})) as never)
  vi.mocked(chrome.storage.local.set).mockImplementation((async (items: Record<string, unknown>) => { Object.assign(disk, structuredClone(items)) }) as never)
  vi.mocked(chrome.storage.local.remove).mockImplementation((async (key: string) => { delete disk[key] }) as never)
  await yjs.clearState()
  disk[yjs.PERSIST_KEY] = { version: 1, origin: "snapshot", data: yjs.encodeSpacesAsStorage(tree()) }
  disk.flextab_recent_destinations = [{ spaceId: "s", projectId: "p", categoryId: "c", groupId: "g" }]
  resetWorkerHydration()
  loadTokens.mockResolvedValue({ access_token: "t" })
})

describe("menus and commands", () => {
  it("registers page, link and window entries and maps ids", () => {
    registerCaptureMenus()
    expect(vi.mocked(chrome.contextMenus.create).mock.calls.map(c => (c[0] as { id: string }).id))
      .toEqual([MENU_SAVE_PAGE, MENU_SAVE_LINK, MENU_SAVE_WINDOW])
    expect(menuKind(MENU_SAVE_LINK)).toBe("link")
    expect(menuKind("other")).toBeNull()
    expect(commandKind("save-page")).toBe("page")
    expect(commandKind("save-window")).toBe("window")
    expect(commandKind("x")).toBeNull()
  })
})

describe("captureFromBackground", () => {
  it("saves the page into the last group and stores a receipt for the popup", async () => {
    const tab = { id: 1, windowId: 3, url: "https://a.example", title: "A" } as chrome.tabs.Tab
    expect(await captureFromBackground("page", { tab })).toBe("saved")
    expect(stored()[0].tabs.map(t => t.url)).toEqual(["https://a.example"])
    expect(disk.flextab_last_capture).toMatchObject({ target: { groupId: "g" }, closed: [] })
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "1" })
    expect(await captureFromBackground("page", { tab })).toBe("already")
  })

  it("clears the badge after a moment", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    await captureFromBackground("page", { tab: { id: 1, url: "https://a.example" } as chrome.tabs.Tab })
    await captureFromBackground("page", { tab: { id: 2, url: "https://e.example" } as chrome.tabs.Tab })
    vi.advanceTimersByTime(3000)
    expect(chrome.action.setBadgeText).toHaveBeenLastCalledWith({ text: "" })
    expect(chrome.action.setTitle).toHaveBeenLastCalledWith({ title: "FlexTab" })
    vi.useRealTimers()
  })

  it("saves a link with its URL as the title fallback", async () => {
    expect(await captureFromBackground("link", { linkUrl: "https://b.example" })).toBe("saved")
    expect(stored()[0].tabs[0]).toMatchObject({ url: "https://b.example", title: "https://b.example" })
    expect(await captureFromBackground("link", {})).toBe("unsavable")
  })

  it("saves a window as its own group and closes it when that's switched on", async () => {
    disk.flextab_close_after_save = true
    const tabs = [
      { id: 1, windowId: 3, index: 0, url: "https://a.example" },
      { id: 2, windowId: 3, index: 1, url: "https://b.example", pinned: true },
      { id: 3, windowId: 3, index: 2, url: "chrome-extension://x/newtab.html" },
    ] as chrome.tabs.Tab[]
    vi.mocked(chrome.tabs.query).mockResolvedValue(tabs)
    expect(await captureFromBackground("window", { tab: tabs[0] })).toBe("saved")
    const groups = stored()
    expect(groups).toHaveLength(2)
    expect(groups[1].name).toMatch(/^Window /)
    expect(groups[1].tabs.map(t => t.url)).toEqual(["https://a.example", "https://b.example"])
    expect(chrome.tabs.remove).toHaveBeenCalledWith([1])
    expect((disk.flextab_last_capture as { closed: unknown[] }).closed).toHaveLength(1)
  })

  it("uses the active tab / current window when the event has no tab", async () => {
    vi.mocked(chrome.tabs.query).mockResolvedValue([{ id: 1, url: "https://c.example" }] as chrome.tabs.Tab[])
    expect(await captureFromBackground("page", {})).toBe("saved")
    expect(await captureFromBackground("window", {})).toBe("saved")
    expect(chrome.tabs.query).toHaveBeenCalledWith({ currentWindow: true })
  })

  it("flags an unsavable page with the badge and writes nothing", async () => {
    expect(await captureFromBackground("page", { tab: { id: 1, url: "chrome://settings" } as chrome.tabs.Tab })).toBe("unsavable")
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "×" })
  })

  it("opens FlexTab instead of saving before the first new tab has created the workspace", async () => {
    delete disk[yjs.PERSIST_KEY]
    expect(await captureFromBackground("page", { tab: { id: 1, url: "https://a.example" } as chrome.tabs.Tab })).toBe("no-workspace")
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: "chrome-extension://test/newtab.html" })
  })

  it("saves into the default path when the space has no category yet", async () => {
    disk[yjs.PERSIST_KEY] = { version: 1, origin: "snapshot", data: yjs.encodeSpacesAsStorage([{ id: "s", name: "W", order: 0, projects: [] }]) }
    expect(await captureFromBackground("page", { tab: { id: 1, url: "https://a.example" } as chrome.tabs.Tab })).toBe("saved")
    const [project] = yjs.getSpaces()[0].projects
    expect([project.name, project.categories[0].name, project.categories[0].groups[0].name]).toEqual(["General", "Uncategorized", "Unsorted"])
    expect(project.categories[0].groups[0].tabs.map((t) => t.url)).toEqual(["https://a.example"])
  })

  it("saves into a new Personal space when the workspace has no spaces (TASK-37)", async () => {
    disk[yjs.PERSIST_KEY] = { version: 1, origin: "snapshot", data: yjs.encodeSpacesAsStorage([]) }
    expect(await captureFromBackground("page", { tab: { id: 1, url: "https://a.example" } as chrome.tabs.Tab })).toBe("saved")
    expect(chrome.action.openPopup).not.toHaveBeenCalled()
    const [space] = yjs.getSpaces()
    expect(space.name).toBe("Personal")
    expect(space.projects[0].name).toBe("General")
    expect(space.projects[0].categories[0].name).toBe("Uncategorized")
    expect(space.projects[0].categories[0].groups[0].tabs.map(t => t.url)).toEqual(["https://a.example"])
  })

  it("an unsavable page in an empty workspace creates no space", async () => {
    disk[yjs.PERSIST_KEY] = { version: 1, origin: "snapshot", data: yjs.encodeSpacesAsStorage([]) }
    expect(await captureFromBackground("page", { tab: { id: 1, url: "chrome://settings" } as chrome.tabs.Tab })).toBe("unsavable")
    expect(yjs.getSpaces()).toEqual([])
  })

  it("reports a refused write with the badge", async () => {
    vi.mocked(chrome.storage.local.set).mockImplementation((async (items: Record<string, unknown>) => {
      if (yjs.PERSIST_KEY in items) throw new Error("quota")
      Object.assign(disk, items)
    }) as never)
    expect(await captureFromBackground("page", { tab: { id: 1, url: "https://a.example" } as chrome.tabs.Tab })).toBe("failed")
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "!" })
  })
})
