import { beforeEach, describe, expect, it, vi } from "vitest"
import { mockedAsync } from "~src/test/chromeMocks"
import { bestSameHostMatch, continuationTabs, findLinkedTab, getOpenLink, noteJustUpdated, recordOpenLinks, restoreLinkedTab, sameHostTabs, updateLinkedTab, type OpenLink } from "./openLinks"
import * as yjs from "~src/lib/yjsDoc"
import { openGroupTabs, openOrFocus } from "./openTab"
import type { SavedSpace } from "~src/types"

const link = (tabId: string): OpenLink => ({ spaceId: "s", projectId: "p", categoryId: "c", groupId: "g", tabId })
let session: Record<string, unknown>

beforeEach(() => {
  vi.clearAllMocks()
  session = {}
  vi.mocked(chrome.storage.session.get).mockImplementation(async (key: any) => ({ [key]: session[key] }))
  vi.mocked(chrome.storage.session.set).mockImplementation(async (items: any) => { Object.assign(session, structuredClone(items)) })
})

describe("open links", () => {
  it("records links and drops those of tabs that are gone", async () => {
    mockedAsync<chrome.tabs.Tab[]>(chrome.tabs.query).mockResolvedValue([{ id: 1 }, { id: 2 }] as chrome.tabs.Tab[])
    await recordOpenLinks([[1, link("a")], [3, link("c")]])
    expect(await getOpenLink(1)).toEqual(link("a"))
    expect(await getOpenLink(3)).toBeNull()
    expect(await getOpenLink(undefined)).toBeNull()
  })

  it("lists same-site saved tabs other than the page itself", () => {
    const spaces: SavedSpace[] = [{ id: "s", name: "Work", order: 0, projects: [{ id: "p", name: "P", order: 0, categories: [{ id: "c", name: "C", order: 0, groups: [
      { id: "g", name: "Summer", order: 0, tabs: [
        { id: "a", url: "https://anime.test/show/episode/1", title: "Show 1", favicon: "", order: 0 },
        { id: "b", url: "https://anime.test/show/episode/2", title: "Show 2", favicon: "", order: 1 },
        { id: "x", url: "https://other.test/", title: "Other", favicon: "", order: 2 },
        { id: "bad", url: "not a url", title: "Broken", favicon: "", order: 3 },
      ] },
    ] }] }] }]
    const hits = sameHostTabs(spaces, "https://anime.test/show/episode/2")
    expect(hits.map(h => h.tab.id)).toEqual(["a"])
    expect(hits[0].path).toBe("Work › Summer")
    expect(findLinkedTab(spaces, hits[0].link)?.title).toBe("Show 1")
    expect(findLinkedTab(spaces, link("gone"))).toBeNull()
    expect(sameHostTabs(spaces, "not a url")).toEqual([])
    expect(sameHostTabs(spaces, "file:///Users/me/notes.html")).toEqual([]) // no host to match
  })

  it("openOrFocus and openGroupTabs remember which saved tab each browser tab came from", async () => {
    mockedAsync<chrome.tabs.Tab[]>(chrome.tabs.query).mockResolvedValue([{ id: 11 }, { id: 21 }, { id: 22 }] as chrome.tabs.Tab[])
    vi.mocked(chrome.tabs.create).mockResolvedValueOnce({ id: 11 } as never)
    await openOrFocus("https://anime.test/show/episode/1", link("a"))
    expect(await getOpenLink(11)).toEqual(link("a"))

    mockedAsync<chrome.windows.Window>(chrome.windows.getCurrent).mockResolvedValue({ id: 9 } as chrome.windows.Window)
    vi.mocked(chrome.tabs.create).mockResolvedValueOnce({ id: 21 } as never).mockResolvedValueOnce({ id: 22 } as never)
    await openGroupTabs(["https://x.test/1", "https://x.test/2"], "here", { title: "G" }, false, [link("b"), link("c")])
    expect(await getOpenLink(21)).toEqual(link("b"))
    expect(await getOpenLink(22)).toEqual(link("c"))
  })
})

describe("bestSameHostMatch", () => {
  const space = (tabs: { id: string; url: string }[]): SavedSpace[] => [{ id: "s", name: "Work", order: 0, projects: [{ id: "p", name: "P", order: 0, categories: [{ id: "c", name: "C", order: 0, groups: [
    { id: "g", name: "Summer", order: 0, tabs: tabs.map((t, i) => ({ ...t, title: t.id, favicon: "", order: i })) },
  ] }] }] }]
  it("picks the one saved tab whose address the page continues", () => {
    const hit = bestSameHostMatch(space([
      { id: "ore", url: "https://a.test/anime/2711/ore-dake/episode/1" },
      { id: "kus", url: "https://a.test/anime/2650/kusuriya/episode/2" },
    ]), "https://a.test/anime/2711/ore-dake/episode/3")
    expect(hit?.tab.id).toBe("ore")
  })
  it("does not guess when two saved tabs match equally, when little is shared, or for a page without a path", () => {
    expect(bestSameHostMatch(space([
      { id: "e1", url: "https://a.test/anime/2711/ore-dake/episode/1" },
      { id: "e2", url: "https://a.test/anime/2711/ore-dake/episode/2" },
    ]), "https://a.test/anime/2711/ore-dake/episode/3")).toBeNull()
    expect(bestSameHostMatch(space([{ id: "x", url: "https://a.test/blog/2024/some-post" }]), "https://a.test/blog/2025/other-post")).toBeNull()
    expect(bestSameHostMatch(space([{ id: "x", url: "https://a.test/a/b" }]), "https://a.test/")).toBeNull()
    expect(bestSameHostMatch(space([{ id: "x", url: "https://a.test/a/b" }]), "not a url")).toBeNull()
    expect(bestSameHostMatch(space([{ id: "x", url: "https://a.test/a/b" }]), undefined)).toBeNull()
    expect(sameHostTabs(space([{ id: "x", url: "https://a.test/a/b" }]), undefined)).toEqual([])
  })
  it("lists only the saved tabs the page continues, not every tab on the site", () => {
    const tabs = space([
      { id: "e1", url: "https://a.test/anime/2711/ore-dake/episode/1" },
      { id: "e2", url: "https://a.test/anime/2711/ore-dake/episode/2" },
      { id: "other", url: "https://a.test/anime/2650/kusuriya/episode/2" },
      { id: "home", url: "https://a.test/" },
    ])
    expect(continuationTabs(tabs, "https://a.test/anime/2711/ore-dake/episode/3").map((h) => h.tab.id)).toEqual(["e1", "e2"])
    expect(continuationTabs(tabs, "https://a.test/about")).toEqual([])
  })
})

describe("updating a linked saved tab in place", () => {
  const seed = () => yjs.setSpaces([{ id: "s", name: "Work", order: 0, projects: [{ id: "p", name: "P", order: 0, categories: [{ id: "c", name: "C", order: 0, groups: [
    { id: "g", name: "Summer", order: 0, tabs: [
      { id: "a", url: "https://anime.test/show/episode/1", title: "Show 1", favicon: "data:old", order: 0 },
      { id: "b", url: "https://anime.test/other/episode/4", title: "Other 4", favicon: "", order: 1 },
    ] },
  ] }] }] }])
  const tabs = () => yjs.getSpaces()[0].projects[0].categories[0].groups[0].tabs

  it("keeps id and position, takes the new url, title and favicon, and restores on Undo", async () => {
    seed()
    const before = await updateLinkedTab(link("a"), { url: "https://anime.test/show/episode/2", title: "Show 2" })
    expect(before).toMatchObject({ id: "a", url: "https://anime.test/show/episode/1" })
    expect(tabs().map(t => [t.id, t.url, t.title])).toEqual([["a", "https://anime.test/show/episode/2", "Show 2"], ["b", "https://anime.test/other/episode/4", "Other 4"]])
    // No favicon from the page: the old one stays.
    expect(tabs()[0].favicon).toBe("data:old")
    restoreLinkedTab(link("a"), before!)
    expect(tabs()[0]).toMatchObject({ id: "a", url: "https://anime.test/show/episode/1", title: "Show 1" })
  })

  it("keeps the old title when the page has none, and does nothing for a gone tab or a page without a url", async () => {
    seed()
    await updateLinkedTab(link("a"), { url: "https://anime.test/show/episode/3" })
    expect(tabs()[0]).toMatchObject({ url: "https://anime.test/show/episode/3", title: "Show 1" })
    expect(await updateLinkedTab(link("gone"), { url: "https://x.test" })).toBeNull()
    expect(await updateLinkedTab(link("b"), {})).toBeNull()
  })

  it("stays quiet when session storage fails", async () => {
    vi.mocked(chrome.storage.session.set).mockRejectedValue(new Error("no session"))
    await expect(noteJustUpdated("a")).resolves.toBeUndefined()
    vi.mocked(chrome.storage.session.get).mockRejectedValue(new Error("no session"))
    expect(await getOpenLink(1)).toBeNull()
    vi.mocked(chrome.tabs.query).mockRejectedValue(new Error("no tabs"))
    await expect(recordOpenLinks([[1, link("a")]])).resolves.toBeUndefined()
    await expect(recordOpenLinks([])).resolves.toBeUndefined()
    expect(chrome.storage.session.set).toHaveBeenCalledTimes(1) // only the failed noteJustUpdated
  })
})
