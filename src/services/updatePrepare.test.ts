import { beforeEach, describe, expect, it, vi } from "vitest"

const flush = vi.hoisted(() => ({ persist: vi.fn(), settings: vi.fn(), refresh: vi.fn() }))
vi.mock("~src/lib/yjsDoc", () => ({ flushPersist: flush.persist }))
vi.mock("./settingsSync", () => ({ flushSettingsSync: flush.settings }))
vi.mock("./api", () => ({ waitForTokenRefresh: flush.refresh }))

import { PREPARE_UPDATE_MESSAGE } from "./updateFlow"
import { installUpdatePrepareListener } from "./updatePrepare"

type Listener = (message: unknown, sender: unknown, sendResponse: (r: unknown) => void) => boolean | undefined

describe("the page answers an update only after its writes are done (TASK-113)", () => {
  let listener: Listener

  beforeEach(() => {
    vi.mocked(chrome.runtime.onMessage.addListener).mockClear()
    for (const fn of Object.values(flush)) fn.mockReset().mockResolvedValue(undefined)
    installUpdatePrepareListener()
    listener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0][0] as unknown as Listener
  })

  it("finishes the workspace write, the settings base and a token refresh, then answers", async () => {
    let finishPersist!: () => void
    flush.persist.mockImplementation(() => new Promise<void>((r) => { finishPersist = r }))
    const sendResponse = vi.fn()
    expect(listener({ type: PREPARE_UPDATE_MESSAGE }, {}, sendResponse)).toBe(true)
    await new Promise((r) => setTimeout(r, 0))
    expect(sendResponse).not.toHaveBeenCalled()
    finishPersist()
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }))
    expect(flush.settings).toHaveBeenCalled()
    expect(flush.refresh).toHaveBeenCalled()
  })

  it("still answers when one of them fails", async () => {
    flush.settings.mockRejectedValue(new Error("disk"))
    const sendResponse = vi.fn()
    listener({ type: PREPARE_UPDATE_MESSAGE }, {}, sendResponse)
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }))
  })

  it("ignores other messages", () => {
    const sendResponse = vi.fn()
    expect(listener({ type: "something-else" }, {}, sendResponse)).toBeUndefined()
    expect(flush.persist).not.toHaveBeenCalled()
  })
})
