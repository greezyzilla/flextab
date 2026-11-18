import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import * as yjs from "~src/lib/yjsDoc"
import { buildSavedUrlIndex } from "~src/lib/savedUrlIndex"
import type { SavedSpace } from "~src/types"
import { resetWorkerHydration } from "./capture"
import { flashBadge, IDLE_TITLE, installToolbarBadge, refreshToolbar, toolbarStateFor } from "./toolbarBadge"

const MARKED = { 16: "marked-16", 32: "marked-32" }
const PLAIN = { 16: "icon16.png", 32: "icon32.png" }
vi.mock("./savedMarkIcon", () => ({
  savedIconImages: vi.fn(async () => MARKED),
  defaultIconPaths: vi.fn(() => PLAIN),
}))

const tree = (urls: string[]): SavedSpace[] => [{
  id: "s", name: "Work", order: 0,
  projects: [{ id: "p", name: "Launch Q1", order: 0, categories: [{ id: "c", name: "Research", order: 0, groups: [
    { id: "g", name: "Competitors", order: 0, tabs: urls.map((url, i) => ({ id: `t${i}`, url, title: url, order: i })) },
  ] }] }],
}] as SavedSpace[]

let disk: Record<string, unknown>
const store = (urls: string[]) => { disk[yjs.PERSIST_KEY] = { version: 1, origin: "snapshot", data: yjs.encodeSpacesAsStorage(tree(urls)) } }
const tab = (id: number, url: string, extra: Partial<chrome.tabs.Tab> = {}) => ({ id, url, active: true, windowId: 1, ...extra }) as chrome.tabs.Tab
const lastOf = <K extends "setBadgeText" | "setTitle" | "setIcon">(fn: K, tabId: number) =>
  (vi.mocked(chrome.action[fn]).mock.calls as unknown as [Record<string, unknown>][]).filter(([d]) => d.tabId === tabId).at(-1)?.[0]
const lastText = (tabId: number) => lastOf("setBadgeText", tabId)?.text
const lastTitle = (tabId: number) => lastOf("setTitle", tabId)?.title
/** "marked" while the tab shows the saved check, "plain" while it shows the plain icon. */
const iconOf = (tabId: number) => {
  const call = lastOf("setIcon", tabId)
  return call === undefined ? undefined : call.imageData === MARKED ? "marked" : call.path === PLAIN ? "plain" : "other"
}
const listener = <T,>(event: { addListener: unknown }) => vi.mocked(event.addListener as (cb: T) => void).mock.calls.at(-1)![0]
const SAVED_TITLE = "FlexTab: Saved in Work › Launch Q1 › Research › Competitors"

beforeEach(async () => {
  vi.clearAllMocks()
  disk = {}
  vi.mocked(chrome.storage.local.get).mockImplementation((async (key: string) => (key in disk ? { [key]: disk[key] } : {})) as never)
  await yjs.clearState()
  resetWorkerHydration()
  store(["https://linear.app/features"])
})
afterEach(() => vi.useRealTimers())

describe("toolbarStateFor", () => {
  const index = buildSavedUrlIndex(tree(["https://linear.app/features", "https://vercel.com/pricing"]))

  it("marks a saved page and names where it is, the way Opened Tabs does", () => {
    expect(toolbarStateFor("https://linear.app/features/", index)).toEqual({ saved: true, title: SAVED_TITLE })
  })

  it("marks nothing for a page that isn't saved, or can't be", () => {
    expect(toolbarStateFor("https://height.app/", index)).toEqual({ saved: false, title: IDLE_TITLE })
    expect(toolbarStateFor("chrome://extensions", index)).toEqual({ saved: false, title: IDLE_TITLE })
    expect(toolbarStateFor(undefined, index)).toEqual({ saved: false, title: IDLE_TITLE })
  })

  it("counts the places when a page is saved in more than one", () => {
    const twice = buildSavedUrlIndex([...tree(["https://a.example"]), { ...tree(["https://a.example"])[0], id: "s2", name: "Home" }])
    expect(toolbarStateFor("https://a.example", twice).title).toBe("FlexTab: Saved in 2 places")
  })
})

describe("refreshToolbar", () => {
  it("draws the check on the front tab of every window, per tab, with no badge", async () => {
    vi.mocked(chrome.tabs.query).mockResolvedValue([tab(1, "https://linear.app/features"), tab(2, "https://height.app/", { windowId: 2 })] as never)
    await refreshToolbar()
    expect(chrome.tabs.query).toHaveBeenCalledWith({ active: true })
    expect(iconOf(1)).toBe("marked")
    expect(lastTitle(1)).toBe(SAVED_TITLE)
    expect(lastText(1)).toBe("")
    expect(iconOf(2)).toBe("plain")
    expect(lastTitle(2)).toBe(IDLE_TITLE)
  })

  it("names a tab still loading by where it is going", async () => {
    await refreshToolbar([tab(3, "", { pendingUrl: "https://linear.app/features" })])
    expect(iconOf(3)).toBe("marked")
  })

  it("marks nothing before a workspace exists", async () => {
    delete disk[yjs.PERSIST_KEY]
    await refreshToolbar([tab(1, "https://linear.app/features")])
    expect(iconOf(1)).toBe("plain")
  })

  it("does nothing without tabs, and survives a tab that closed meanwhile", async () => {
    vi.mocked(chrome.tabs.query).mockResolvedValue([] as never)
    await refreshToolbar()
    expect(chrome.action.setIcon).not.toHaveBeenCalled()
    vi.mocked(chrome.action.setIcon).mockRejectedValueOnce(new Error("No tab with id: 1"))
    await expect(refreshToolbar([tab(1, "https://linear.app/features")])).resolves.toBeUndefined()
    vi.mocked(chrome.tabs.query).mockRejectedValueOnce(new Error("gone"))
    await expect(refreshToolbar()).resolves.toBeUndefined()
  })

  it("skips a tab without an id", async () => {
    await refreshToolbar([{ url: "https://linear.app/features", active: true } as chrome.tabs.Tab])
    expect(chrome.action.setIcon).not.toHaveBeenCalled()
  })
})

describe("flashBadge", () => {
  it("confirms a capture on its tab as a badge, then returns to the resting check", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    vi.mocked(chrome.tabs.get).mockResolvedValue(tab(1, "https://linear.app/features") as never)
    await flashBadge(1, "1", "#16a34a", "FlexTab: saved 1 tab", 2500)
    expect(lastText(1)).toBe("1")
    expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ tabId: 1, color: "#16a34a" })
    expect(chrome.action.setBadgeTextColor).toHaveBeenCalledWith({ tabId: 1, color: "#ffffff" })
    // The resting state waits while the confirmation shows.
    await refreshToolbar([tab(1, "https://linear.app/features")])
    expect(lastText(1)).toBe("1")
    expect(iconOf(1)).toBeUndefined()
    // A second capture restarts the wait.
    await flashBadge(1, "!", "#dc2626", "FlexTab: couldn't save to this device", 2500)
    vi.advanceTimersByTime(2600)
    await vi.waitFor(() => expect(iconOf(1)).toBe("marked"))
    expect(lastTitle(1)).toBe(SAVED_TITLE)
    expect(lastText(1)).toBe("")
  })

  it("lets the confirmation go when its tab closed", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    vi.mocked(chrome.tabs.get).mockRejectedValue(new Error("No tab with id: 9"))
    vi.mocked(chrome.action.setTitle).mockRejectedValueOnce(new Error("No tab with id: 9"))
    await expect(flashBadge(9, "1", "#16a34a", "FlexTab: saved 1 tab", 100)).resolves.toBeUndefined()
    vi.advanceTimersByTime(200)
    await Promise.resolve()
    expect(lastText(9)).toBe("1")
    expect(chrome.action.setIcon).not.toHaveBeenCalled()
  })
})

describe("installToolbarBadge", () => {
  beforeEach(() => {
    vi.mocked(chrome.tabs.query).mockResolvedValue([tab(1, "https://linear.app/features")] as never)
    installToolbarBadge()
  })

  it("paints when the worker starts", async () => {
    await vi.waitFor(() => expect(iconOf(1)).toBe("marked"))
  })

  it("repaints on a tab switch", async () => {
    vi.mocked(chrome.tabs.get).mockResolvedValue(tab(5, "https://height.app/") as never)
    listener<(i: { tabId: number }) => void>(chrome.tabs.onActivated)({ tabId: 5 })
    await vi.waitFor(() => expect(iconOf(5)).toBe("plain"))
    vi.mocked(chrome.tabs.get).mockRejectedValueOnce(new Error("closed"))
    listener<(i: { tabId: number }) => void>(chrome.tabs.onActivated)({ tabId: 6 })
  })

  it("repaints when the front tab navigates, not for loading or background tabs", async () => {
    const onUpdated = listener<(id: number, c: chrome.tabs.TabChangeInfo, t: chrome.tabs.Tab) => void>(chrome.tabs.onUpdated)
    await vi.waitFor(() => expect(iconOf(1)).toBe("marked"))
    vi.mocked(chrome.action.setIcon).mockClear()
    onUpdated(1, { status: "loading" }, tab(1, "https://height.app/"))
    onUpdated(2, { url: "https://height.app/" }, tab(2, "https://height.app/", { active: false }))
    expect(chrome.action.setIcon).not.toHaveBeenCalled()
    onUpdated(1, { url: "https://height.app/" }, tab(1, "https://height.app/"))
    await vi.waitFor(() => expect(iconOf(1)).toBe("plain"))
  })

  it("repaints once a workspace change settles, from any page or device", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    const onChanged = listener<(c: Record<string, unknown>, area: string) => void>(chrome.storage.onChanged)
    await vi.waitFor(() => expect(iconOf(1)).toBe("marked"))
    vi.mocked(chrome.action.setIcon).mockClear()
    onChanged({ other: {} }, "local")
    onChanged({ [yjs.PERSIST_KEY]: {} }, "sync")
    vi.advanceTimersByTime(500)
    expect(chrome.action.setIcon).not.toHaveBeenCalled()
    store([])
    onChanged({ [yjs.PERSIST_KEY]: {} }, "local")
    onChanged({ [yjs.PERSIST_KEY]: {} }, "local")
    vi.advanceTimersByTime(200)
    await vi.waitFor(() => expect(iconOf(1)).toBe("plain"))
  })
})
