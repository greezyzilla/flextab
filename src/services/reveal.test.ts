import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { openInFlexTab, takeRevealRequest, REVEAL_REQUEST_KEY, REVEAL_REQUEST_TTL_MS } from "./reveal"
import { useRevealRequests } from "~src/hooks/useRevealRequests"
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore"
import { useUIStore } from "~src/store/useUIStore"

// The popup's "Open in FlexTab".
const target = { spaceId: "s2", projectId: "p2", categoryId: "c2", flash: { kind: "tab" as const, id: "t9" } }
const page = "chrome-extension://test/newtab.html"

beforeEach(() => {
  vi.clearAllMocks()
  useSavedSpacesStore.setState({
    savedSpaces: [{ id: "s2", name: "Two", order: 0, projects: [{ id: "p2", name: "P", order: 0, categories: [{ id: "c2", name: "C", order: 0, groups: [] }] }] }],
    activeSpaceId: null, activeProjectId: null, activeCategoryId: null, expandedProjectIds: [],
  })
  vi.mocked(chrome.tabs.update).mockResolvedValue({} as never)
})

describe("openInFlexTab", () => {
  it("brings forward the FlexTab page used last in this window, override or extension page", async () => {
    vi.mocked(chrome.tabs.query).mockResolvedValue([
      { id: 1, url: "https://a.example", lastAccessed: 9 },
      { id: 2, url: `${page}#/settings` },
      { id: 3, url: "chrome://newtab/", lastAccessed: 5 },
    ] as never)
    await openInFlexTab(target)
    expect(chrome.tabs.create).not.toHaveBeenCalled()
    expect(chrome.storage.session.set).toHaveBeenCalledWith({ [REVEAL_REQUEST_KEY]: expect.objectContaining({ tabId: 3, target }) })
    expect(chrome.tabs.update).toHaveBeenCalledWith(3, { active: true })
  })

  it("opens one when none is open, and gives up quietly without a tab id", async () => {
    vi.mocked(chrome.tabs.query).mockRejectedValue(new Error("no tabs"))
    vi.mocked(chrome.tabs.create).mockResolvedValue({ id: 7 } as never)
    await openInFlexTab(target)
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: page, active: false })
    expect(chrome.tabs.update).toHaveBeenCalledWith(7, { active: true })
    vi.mocked(chrome.tabs.create).mockResolvedValue({} as never)
    vi.mocked(chrome.tabs.update).mockClear()
    await openInFlexTab(target)
    expect(chrome.tabs.update).not.toHaveBeenCalled()
  })
})

describe("takeRevealRequest", () => {
  it("reveals only a fresh request addressed to this tab, and clears it", async () => {
    const fresh = { tabId: 4, target, at: Date.now() }
    expect(await takeRevealRequest(undefined, fresh)).toBe(false)
    expect(await takeRevealRequest(5, fresh)).toBe(false)
    expect(await takeRevealRequest(4, { ...fresh, at: Date.now() - REVEAL_REQUEST_TTL_MS - 1 })).toBe(false)
    expect(await takeRevealRequest(4, undefined)).toBe(false)
    expect(chrome.storage.session.remove).not.toHaveBeenCalled()
    expect(await takeRevealRequest(4, fresh)).toBe(true)
    expect(chrome.storage.session.remove).toHaveBeenCalledWith(REVEAL_REQUEST_KEY)
    expect(useSavedSpacesStore.getState()).toMatchObject({ activeSpaceId: "s2", activeProjectId: "p2", activeCategoryId: "c2" })
    expect(useUIStore.getState().flashTarget).toMatchObject({ kind: "tab", id: "t9" })
  })
})

describe("useRevealRequests", () => {
  const getCurrent = vi.fn()
  beforeEach(() => { (chrome.tabs as unknown as { getCurrent: typeof getCurrent }).getCurrent = getCurrent.mockResolvedValue({ id: 4 }) })

  it("waits for the workspace, then takes a request left before the page loaded", async () => {
    vi.mocked(chrome.storage.session.get).mockResolvedValue({ [REVEAL_REQUEST_KEY]: { tabId: 4, target, at: Date.now() } } as never)
    const { rerender } = renderHook(({ ready }) => useRevealRequests(ready), { initialProps: { ready: false } })
    expect(getCurrent).not.toHaveBeenCalled()
    rerender({ ready: true })
    await waitFor(() => expect(useSavedSpacesStore.getState().activeSpaceId).toBe("s2"))
  })

  it("takes one that arrives while open, and stops listening when unmounted", async () => {
    vi.mocked(chrome.storage.session.get).mockResolvedValue({} as never)
    const { unmount } = renderHook(() => useRevealRequests(true))
    await waitFor(() => expect(chrome.storage.onChanged.addListener).toHaveBeenCalled())
    const listener = vi.mocked(chrome.storage.onChanged.addListener).mock.calls.at(-1)![0] as (c: Record<string, chrome.storage.StorageChange>, a: string) => void
    await waitFor(() => expect(getCurrent).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 0))
    listener({ [REVEAL_REQUEST_KEY]: { newValue: { tabId: 4, target, at: Date.now() } } }, "local") // wrong area
    expect(useSavedSpacesStore.getState().activeSpaceId).toBe(null)
    listener({ [REVEAL_REQUEST_KEY]: { newValue: { tabId: 4, target, at: Date.now() } } }, "session")
    await waitFor(() => expect(useSavedSpacesStore.getState().activeSpaceId).toBe("s2"))
    unmount()
    expect(chrome.storage.onChanged.removeListener).toHaveBeenCalledWith(listener)
  })

  it("does nothing without extension APIs", async () => {
    getCurrent.mockRejectedValue(new Error("no tabs api"))
    renderHook(() => useRevealRequests(true))
    await new Promise((r) => setTimeout(r, 0))
    expect(useSavedSpacesStore.getState().activeSpaceId).toBe(null)
  })
})
