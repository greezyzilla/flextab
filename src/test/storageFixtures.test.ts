/**
 * Persisted data from every released version still loads (TASK-113). Each file in
 * fixtures/storage is what one release left in browser storage, captured by
 * scripts/capture-storage-fixture.mjs from that release's own build. This test
 * loads each one through the app's real hydration: the workspace, the UI
 * selection, the settings and the sign-in.
 */
import { readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { SavedSpace } from "~src/types"

interface Fixture {
  version: string
  expected: { titles: string[]; density: string; auth: Record<string, unknown> }
  local: Record<string, unknown>
  sync: Record<string, unknown>
}

const dir = resolve(__dirname, "fixtures/storage")
const fixtures: Fixture[] = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(resolve(dir, f), "utf8")))

function area(disk: Record<string, unknown>) {
  const pick = (keys: string | string[] | Record<string, unknown> | null) => {
    if (keys === null || keys === undefined) return structuredClone(disk)
    const names = typeof keys === "string" ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys)
    return Object.fromEntries(names.filter((k) => k in disk).map((k) => [k, structuredClone(disk[k])]))
  }
  return {
    get: vi.fn(async (keys: never) => pick(keys)),
    set: vi.fn(async (values: Record<string, unknown>) => { Object.assign(disk, structuredClone(values)) }),
    remove: vi.fn(async (keys: string | string[]) => { for (const k of [keys].flat()) delete disk[k] }),
  }
}

const tabTitles = (spaces: SavedSpace[]) =>
  spaces.flatMap((s) => s.projects.flatMap((p) => p.categories.flatMap((c) => c.groups.flatMap((g) => g.tabs.map((t) => t.title)))))

describe.each(fixtures.map((f) => [f.version, f] as const))("storage left by v%s", (_, fixture) => {
  beforeEach(() => {
    vi.resetModules()
    Object.assign(chrome.storage.local, area(structuredClone(fixture.local)))
    Object.assign(chrome.storage.sync, area(structuredClone(fixture.sync)))
  })

  it("loads the workspace with every saved tab", async () => {
    const yjs = await import("~src/lib/yjsDoc")
    const { hydrateYjs } = await import("~src/store/useSavedSpacesStore")
    await hydrateYjs()
    const titles = tabTitles(yjs.getSpaces())
    for (const title of fixture.expected.titles) expect(titles).toContain(title)
  })

  it("loads the settings", async () => {
    const { useSettingsStore } = await import("~src/store/useSettingsStore")
    await useSettingsStore.persist.rehydrate()
    expect(useSettingsStore.getState().density).toBe(fixture.expected.density)
  })

  it("loads the UI selection store without resetting it", async () => {
    const { useSavedSpacesStore } = await import("~src/store/useSavedSpacesStore")
    await useSavedSpacesStore.persist.rehydrate()
    expect(useSavedSpacesStore.persist.hasHydrated()).toBe(true)
  })

  it("stays signed in", async () => {
    const { loadTokens } = await import("~src/services/api")
    expect(await loadTokens()).toEqual(fixture.expected.auth)
  })
})
