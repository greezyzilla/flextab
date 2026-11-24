import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { UPDATE_REQUIRED_KEY } from "~src/utils/http"
import { APPLY_UPDATE_NOW_MESSAGE } from "./updateFlow"
import { checkForUpdateNow, clearUpdateRequired, installUpdateRequired, readUpdateRequired, requestUpdateCheck, watchUpdateRequired } from "./updateRequired"

const runtime = chrome.runtime as unknown as Record<string, any>
let disk: Record<string, unknown>
const changeListeners: ((changes: Record<string, chrome.storage.StorageChange>, area: string) => void)[] = []

beforeEach(() => {
  disk = {}
  changeListeners.length = 0
  vi.mocked(chrome.storage.local.get).mockImplementation((async (k: string) => (k in disk ? { [k]: disk[k] } : {})) as never)
  vi.mocked(chrome.storage.local.remove).mockImplementation((async (k: string) => { delete disk[k] }) as never)
  vi.mocked(chrome.storage.onChanged.addListener).mockImplementation(((fn: never) => { changeListeners.push(fn) }) as never)
  runtime.requestUpdateCheck = vi.fn(async () => ({ status: "no_update" }))
  vi.mocked(chrome.runtime.sendMessage).mockClear()
})
afterEach(() => { delete runtime.requestUpdateCheck })

const fire = (newValue: unknown, oldValue?: unknown) => changeListeners.forEach((fn) => fn({ [UPDATE_REQUIRED_KEY]: { newValue, oldValue } }, "local"))

describe("Update needed (TASK-114)", () => {
  it("reads, watches and clears the server's too-old record", async () => {
    expect(await readUpdateRequired()).toBeNull()
    disk[UPDATE_REQUIRED_KEY] = { minVersion: "0.2.0", at: 1 }
    const seen: unknown[] = []
    watchUpdateRequired((r) => seen.push(r))
    await vi.waitFor(() => expect(seen).toEqual([{ minVersion: "0.2.0", at: 1 }]))
    fire(undefined, { minVersion: "0.2.0" })
    expect(seen.at(-1)).toBeNull()
    changeListeners.forEach((fn) => fn({ other: { newValue: 1 } }, "local"))
    expect(seen).toHaveLength(2)
    await clearUpdateRequired()
    expect(disk[UPDATE_REQUIRED_KEY]).toBeUndefined()
  })

  it("reads the browser's answer in either shape, and treats a failed check as none", async () => {
    expect(await requestUpdateCheck()).toBe("no_update")
    runtime.requestUpdateCheck = vi.fn(async () => ["update_available", { version: "0.2.0" }])
    expect(await requestUpdateCheck()).toBe("update_available")
    runtime.requestUpdateCheck = vi.fn(async () => { throw new Error("temporary add-on") })
    expect(await requestUpdateCheck()).toBe("no_update")
  })

  it("asks the background to install at once only when an update is coming", async () => {
    expect(await checkForUpdateNow()).toBe("no_update")
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled()
    runtime.requestUpdateCheck = vi.fn(async () => ({ status: "update_available" }))
    expect(await checkForUpdateNow()).toBe("update_available")
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: APPLY_UPDATE_NOW_MESSAGE })
  })

  it("background: checks for an update at start when refused, and when a refusal first arrives", async () => {
    disk[UPDATE_REQUIRED_KEY] = { minVersion: "0.2.0", at: 1 }
    installUpdateRequired()
    await vi.waitFor(() => expect(runtime.requestUpdateCheck).toHaveBeenCalledTimes(1))
    fire({ minVersion: "0.2.0" }, { minVersion: "0.1.9" }) // already known: no new check
    fire(undefined, { minVersion: "0.2.0" })
    expect(runtime.requestUpdateCheck).toHaveBeenCalledTimes(1)
    fire({ minVersion: "0.3.0" })
    expect(runtime.requestUpdateCheck).toHaveBeenCalledTimes(2)
  })
})

describe("Update needed when the extension context fails (TASK-114)", () => {
  it("reads nothing, clears quietly, and treats an empty answer as no update", async () => {
    vi.mocked(chrome.storage.local.get).mockRejectedValueOnce(new Error("no context"))
    expect(await readUpdateRequired()).toBeNull()
    vi.mocked(chrome.storage.local.remove).mockRejectedValueOnce(new Error("no context"))
    await expect(clearUpdateRequired()).resolves.toBeUndefined()
    runtime.requestUpdateCheck = vi.fn(async () => undefined)
    expect(await requestUpdateCheck()).toBe("no_update")
  })

  it("still reports the update when the background cannot be reached", async () => {
    runtime.requestUpdateCheck = vi.fn(async () => ({ status: "update_available" }))
    vi.mocked(chrome.runtime.sendMessage).mockRejectedValueOnce(new Error("no receiver"))
    expect(await checkForUpdateNow()).toBe("update_available")
  })
})
