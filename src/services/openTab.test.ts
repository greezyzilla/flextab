import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { mockedAsync } from "~src/test/chromeMocks"
import { canGroupTabs, groupOpenedTabs, openGroupTabs, openInCurrentWindow, openOrFocus, releaseTabGroups, requestTabGroups } from "./openTab"

beforeEach(() => vi.clearAllMocks())

describe("openOrFocus", () => {
  it("focuses an open tab with the same URL and its window", async () => {
    mockedAsync<chrome.tabs.Tab[]>(chrome.tabs.query).mockResolvedValue([
      { id: 3, windowId: 9, url: "https://Example.com/a/" } as chrome.tabs.Tab,
    ])
    expect(await openOrFocus("https://example.com/a")).toBe("focused")
    expect(chrome.tabs.update).toHaveBeenCalledWith(3, { active: true })
    expect(chrome.windows.update).toHaveBeenCalledWith(9, { focused: true })
    expect(chrome.tabs.create).not.toHaveBeenCalled()
  })

  it("opens a new tab when the URL is not open", async () => {
    mockedAsync<chrome.tabs.Tab[]>(chrome.tabs.query).mockResolvedValue([{ id: 3, windowId: 9, url: "https://other.com" } as chrome.tabs.Tab])
    expect(await openOrFocus("https://example.com/a")).toBe("opened")
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: "https://example.com/a" })
  })
})

describe("openInCurrentWindow", () => {
  it("opens every URL as a background tab in this window", async () => {
    mockedAsync<chrome.windows.Window>(chrome.windows.getCurrent).mockResolvedValue({ id: 4 } as chrome.windows.Window)
    await openInCurrentWindow(["https://a.com", "https://b.com"])
    expect(chrome.tabs.create).toHaveBeenNthCalledWith(1, { url: "https://a.com", windowId: 4, active: false })
    expect(chrome.tabs.create).toHaveBeenNthCalledWith(2, { url: "https://b.com", windowId: 4, active: false })
  })
})

// --- Open all as a browser tab group ---

type Chromeish = Record<string, any>
const c = chrome as unknown as Chromeish

/** A browser with tab groups: the API, the permission flow, and tab ids. */
function withTabGroups({ answer = true }: { answer?: boolean | "reject" } = {}) {
  c.tabs.group = vi.fn(async () => 77)
  c.tabs.ungroup = vi.fn(async () => {})
  c.tabGroups = { update: vi.fn(async () => ({})) }
  c.permissions = {
    request: vi.fn(() => (answer === "reject" ? Promise.reject(new Error("unknown permission")) : Promise.resolve(answer))),
    remove: vi.fn(async () => true),
  }
  let next = 10
  vi.mocked(chrome.tabs.create).mockImplementation((async () => ({ id: next++ })) as never)
  mockedAsync<chrome.windows.Window>(chrome.windows.getCurrent).mockResolvedValue({ id: 4 } as chrome.windows.Window)
  vi.mocked(chrome.windows.create).mockResolvedValue({ id: 8, tabs: [{ id: 21 }, { id: 22 }] } as never)
}

afterEach(() => {
  delete c.tabs.group
  delete c.tabs.ungroup
  delete c.tabGroups
  delete c.permissions
  vi.mocked(chrome.tabs.create).mockReset()
  vi.mocked(chrome.windows.create).mockReset()
})

const look = { title: "Reading", color: "red" as const }

describe("openGroupTabs", () => {
  it("asks inside the click and opens the tabs here as one named, coloured tab group", async () => {
    withTabGroups()
    const pending = openGroupTabs(["https://a.com", "https://b.com"], "here", look, true)
    // The prompt needs the user gesture: the request goes out before any await.
    expect(c.permissions.request).toHaveBeenCalledWith({ permissions: ["tabGroups"] })
    expect(await pending).toEqual({ permission: "granted", grouped: true })
    expect(chrome.tabs.create).toHaveBeenCalledTimes(2)
    expect(c.tabs.group).toHaveBeenCalledWith({ tabIds: [10, 11], createProperties: { windowId: 4 } })
    expect(c.tabGroups.update).toHaveBeenCalledWith(77, { title: "Reading", color: "red" })
  })

  it("opens the tabs while the prompt is still unanswered, and groups them once granted", async () => {
    withTabGroups()
    let answer!: (granted: boolean) => void
    c.permissions.request = vi.fn(() => new Promise<boolean>((resolve) => { answer = resolve }))
    const pending = openGroupTabs(["https://a.com", "https://b.com"], "here", look, true)
    await vi.waitFor(() => expect(chrome.tabs.create).toHaveBeenCalledTimes(2))
    expect(c.tabs.group).not.toHaveBeenCalled()
    answer(true)
    expect(await pending).toEqual({ permission: "granted", grouped: true })
    expect(c.tabs.group).toHaveBeenCalledWith({ tabIds: [10, 11], createProperties: { windowId: 4 } })
  })

  it("groups the tabs of a new window in that window", async () => {
    withTabGroups()
    expect(await openGroupTabs(["https://a.com", "https://b.com"], "new-window", look, true)).toEqual({ permission: "granted", grouped: true })
    expect(chrome.windows.create).toHaveBeenCalledWith({ url: ["https://a.com", "https://b.com"] })
    expect(c.tabs.group).toHaveBeenCalledWith({ tabIds: [21, 22], createProperties: { windowId: 8 } })
  })

  it("opens an uncoloured group as grey, so it looks the same every time", async () => {
    withTabGroups()
    await openGroupTabs(["https://a.com"], "here", { title: "Inbox" }, true)
    expect(c.tabGroups.update).toHaveBeenCalledWith(77, { title: "Inbox", color: "grey" })
  })

  it("opens plain tabs, exactly as before, when the permission is declined", async () => {
    withTabGroups({ answer: false })
    expect(await openGroupTabs(["https://a.com", "https://b.com"], "here", look, true)).toEqual({ permission: "declined", grouped: false })
    expect(chrome.tabs.create).toHaveBeenCalledTimes(2)
    expect(c.tabs.group).not.toHaveBeenCalled()
  })

  it("opens plain tabs and never asks when the setting is off", async () => {
    withTabGroups()
    expect(await openGroupTabs(["https://a.com"], "new-window", look, false)).toEqual({ permission: "off", grouped: false })
    expect(c.permissions.request).not.toHaveBeenCalled()
    expect(chrome.windows.create).toHaveBeenCalledWith({ url: ["https://a.com"] })
    expect(c.tabs.group).not.toHaveBeenCalled()
  })

  it("opens plain tabs and never asks in a browser without tab groups", async () => {
    mockedAsync<chrome.windows.Window>(chrome.windows.getCurrent).mockResolvedValue({ id: 4 } as chrome.windows.Window)
    expect(canGroupTabs()).toBe(false)
    expect(await openGroupTabs(["https://a.com", "https://b.com"], "here", look, true)).toEqual({ permission: "unavailable", grouped: false })
    expect(chrome.tabs.create).toHaveBeenCalledTimes(2)
  })

  it("keeps the tabs when the browser has the API but refuses to group (Opera Air)", async () => {
    withTabGroups()
    c.tabs.group = vi.fn(async () => { throw new Error("Grouping is not supported by tabs in this window.") })
    expect(await openGroupTabs(["https://a.com", "https://b.com"], "here", look, true)).toEqual({ permission: "granted", grouped: false })
    expect(chrome.tabs.create).toHaveBeenCalledTimes(2)
    expect(c.tabGroups.update).not.toHaveBeenCalled()
  })

  it("ungroups instead of leaving an unnamed group when naming fails", async () => {
    withTabGroups()
    c.tabGroups.update = vi.fn(async () => { throw new Error("no") })
    expect(await openGroupTabs(["https://a.com"], "here", look, true)).toEqual({ permission: "granted", grouped: false })
    expect(c.tabs.ungroup).toHaveBeenCalledWith([10])
    c.tabs.ungroup = vi.fn(async () => { throw new Error("gone") })
    expect((await openGroupTabs(["https://a.com"], "here", look, true)).grouped).toBe(false)
  })
})

describe("groupOpenedTabs / permission helpers", () => {
  it("does nothing without tabs or without the tabGroups API", async () => {
    withTabGroups()
    expect(await groupOpenedTabs({ tabIds: [] }, look)).toBe(false)
    delete c.tabGroups
    expect(await groupOpenedTabs({ tabIds: [1] }, look)).toBe(false)
    expect(c.tabs.group).not.toHaveBeenCalled()
  })

  it("groups without a window id when the window is unknown, and skips tabs without ids", async () => {
    withTabGroups()
    vi.mocked(chrome.windows.create).mockResolvedValue({ tabs: [{ id: 5 }, {}] } as never)
    await openGroupTabs(["https://a.com", "https://b.com"], "new-window", look, true)
    expect(c.tabs.group).toHaveBeenCalledWith({ tabIds: [5] })
  })

  it("treats a rejected or throwing request as unavailable, not as a refusal", async () => {
    withTabGroups({ answer: "reject" })
    expect(await requestTabGroups()).toBe("unavailable")
    c.permissions.request = vi.fn(() => { throw new Error("sync") })
    expect(await requestTabGroups()).toBe("unavailable")
  })

  it("gives the permission back, and tolerates a browser that cannot", async () => {
    withTabGroups()
    await releaseTabGroups()
    expect(c.permissions.remove).toHaveBeenCalledWith({ permissions: ["tabGroups"] })
    c.permissions.remove = vi.fn(async () => { throw new Error("no") })
    await expect(releaseTabGroups()).resolves.toBeUndefined()
    delete c.permissions
    await expect(releaseTabGroups()).resolves.toBeUndefined()
  })
})
