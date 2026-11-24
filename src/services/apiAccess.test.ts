import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { DATA_COLLECTION, accessPermissions, hasApiAccess, requestApiAccess, watchApiAccess } from "./apiAccess"

const c = chrome as unknown as Record<string, any>
const runtime = chrome.runtime as unknown as Record<string, unknown>
let granted: boolean

beforeEach(() => {
  granted = true
  c.permissions = {
    contains: vi.fn(async () => granted),
    request: vi.fn(async () => granted),
    onAdded: { addListener: vi.fn(), removeListener: vi.fn() },
    onRemoved: { addListener: vi.fn(), removeListener: vi.fn() },
  }
})

afterEach(() => {
  delete c.permissions
  delete runtime.getBrowserInfo
})

describe("API access", () => {
  it("asks Chrome for the API host only", async () => {
    expect(accessPermissions()).toEqual({ origins: [expect.stringMatching(/\/\*$/)] })
    expect(await hasApiAccess()).toBe(true)
    granted = false
    expect(await hasApiAccess()).toBe(false)
  })

  it("asks Firefox for the host and the data collection consent together", async () => {
    runtime.getBrowserInfo = vi.fn()
    await requestApiAccess()
    expect(c.permissions.request).toHaveBeenCalledWith({ origins: [expect.any(String)], data_collection: DATA_COLLECTION })
  })

  it("declares the same data in code as in the Firefox manifest", () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, "../../package.json"), "utf8"))
    expect(DATA_COLLECTION).toEqual(pkg.manifest.browser_specific_settings.gecko.data_collection_permissions.optional)
  })

  it("reports a refused or failed request as no access", async () => {
    granted = false
    expect(await requestApiAccess()).toBe(false)
    c.permissions.request = vi.fn(async () => { throw new Error("no gesture") })
    expect(await requestApiAccess()).toBe(false)
    c.permissions.request = vi.fn(() => { throw new Error("sync throw") })
    expect(await requestApiAccess()).toBe(false)
  })

  it("assumes access where nothing can be asked: no permissions API, or one that cannot answer", async () => {
    c.permissions.contains = vi.fn(async () => { throw new Error("unknown key") })
    expect(await hasApiAccess()).toBe(true)
    delete c.permissions
    expect(await hasApiAccess()).toBe(true)
    expect(await requestApiAccess()).toBe(true)
  })

  it("reports access now and on every permission change, and stops on unsubscribe", async () => {
    const seen: boolean[] = []
    const stop = watchApiAccess((allowed) => seen.push(allowed))
    await vi.waitFor(() => expect(seen).toEqual([true]))
    granted = false
    c.permissions.onRemoved.addListener.mock.calls[0][0]()
    await vi.waitFor(() => expect(seen).toEqual([true, false]))
    granted = true
    c.permissions.onAdded.addListener.mock.calls[0][0]()
    await vi.waitFor(() => expect(seen).toEqual([true, false, true]))
    stop()
    expect(c.permissions.onAdded.removeListener).toHaveBeenCalled()
    expect(c.permissions.onRemoved.removeListener).toHaveBeenCalled()
  })
})
