import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  MAX_RECENT_DESTINATIONS,
  RECENT_DESTINATIONS_KEY,
  loadRecentDestinations,
  pushRecent,
  rememberDestination,
} from "./recentDestinations"

const t = (c: string) => ({ spaceId: "s", projectId: "p", categoryId: c })
let stored: Record<string, unknown> = {}

beforeEach(() => {
  stored = {}
  vi.mocked(chrome.storage.local.get).mockImplementation((async (key: string) =>
    key in stored ? { [key]: stored[key] } : {}) as never)
  vi.mocked(chrome.storage.local.set).mockImplementation((async (items: Record<string, unknown>) => {
    Object.assign(stored, items)
  }) as never)
})

describe("pushRecent", () => {
  it("puts the newest first, removes duplicates and caps the list", () => {
    expect(pushRecent([t("a"), t("b")], t("b"))).toEqual([t("b"), t("a")])
    expect(pushRecent([t("a"), t("b"), t("c")], t("d"))).toEqual([t("d"), t("a"), t("b")])
    expect(pushRecent([], t("a")).length).toBeLessThanOrEqual(MAX_RECENT_DESTINATIONS)
  })
})

describe("recent destination storage", () => {
  it("remembers destinations newest first and drops extra fields", async () => {
    await rememberDestination(t("a"))
    await rememberDestination({ ...t("b"), extra: 1 } as never)
    await rememberDestination(t("a"))
    expect(await loadRecentDestinations()).toEqual([t("a"), t("b")])
    expect(stored[RECENT_DESTINATIONS_KEY]).toEqual([t("a"), t("b")])
  })

  it("keeps one entry per category, remembering its latest group", async () => {
    await rememberDestination({ ...t("a"), groupId: "g1" })
    await rememberDestination({ ...t("a"), groupId: "g2" })
    expect(await loadRecentDestinations()).toEqual([{ ...t("a"), groupId: "g2" }])
    stored[RECENT_DESTINATIONS_KEY] = [{ ...t("a"), groupId: 5 }]
    expect(await loadRecentDestinations()).toEqual([])
  })

  it("ignores malformed stored data", async () => {
    stored[RECENT_DESTINATIONS_KEY] = [t("a"), { spaceId: 1 }, null, "x"]
    expect(await loadRecentDestinations()).toEqual([t("a")])
    stored[RECENT_DESTINATIONS_KEY] = "nope"
    expect(await loadRecentDestinations()).toEqual([])
  })

  it("never throws when storage is unavailable", async () => {
    vi.mocked(chrome.storage.local.get).mockRejectedValue(new Error("gone"))
    expect(await loadRecentDestinations()).toEqual([])
    vi.mocked(chrome.storage.local.set).mockRejectedValue(new Error("gone"))
    await expect(rememberDestination(t("a"))).resolves.toBeUndefined()
  })
})
