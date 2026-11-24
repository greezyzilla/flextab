import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { UPDATE_REQUIRED_KEY, clientHeaders, clientQuery, clientVersion, http, markClientTooOld } from "./http"

const runtime = chrome.runtime as unknown as Record<string, unknown>
const respond = (status: number, body: unknown) => ({ status, ok: status < 300, clone: () => ({ json: async () => body }), json: async () => body }) as unknown as Response

beforeEach(() => {
  runtime.getManifest = vi.fn(() => ({ version: "0.1.0.7" }))
  global.fetch = vi.fn(async () => respond(200, {}))
  vi.mocked(chrome.storage.local.set).mockClear()
})
afterEach(() => { delete runtime.getManifest })

describe("http, the one way to the server (TASK-114)", () => {
  it("adds the client's version and channel to every request, keeping the caller's headers", async () => {
    await http("https://api.test/x", { method: "POST", headers: { Authorization: "Bearer t", "Content-Type": "application/json" } })
    expect(fetch).toHaveBeenCalledWith("https://api.test/x", {
      method: "POST",
      headers: { Authorization: "Bearer t", "Content-Type": "application/json", "X-Client-Version": "0.1.0.7", "X-Client-Channel": "dev" },
    })
  })

  it("accepts a Headers object too", async () => {
    await http("https://api.test/x", { headers: new Headers({ Accept: "application/json" }) })
    expect(vi.mocked(fetch).mock.calls[0][1]!.headers).toMatchObject({ accept: "application/json", "X-Client-Version": "0.1.0.7" })
  })

  it("gives the same identity to the socket as query parameters", () => {
    expect(clientQuery()).toBe("client_version=0.1.0.7&client_channel=dev")
    expect(clientHeaders()).toEqual({ "X-Client-Version": "0.1.0.7", "X-Client-Channel": "dev" })
  })

  it("records a too-old answer with the minimum, and hands the response back untouched", async () => {
    const answer = respond(426, { code: "client_too_old", min_version: "0.2.0", error: "Update FlexTab" })
    vi.mocked(fetch).mockResolvedValueOnce(answer)
    expect(await http("https://api.test/x")).toBe(answer)
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ [UPDATE_REQUIRED_KEY]: { minVersion: "0.2.0", at: expect.any(Number) } })
  })

  it("records a too-old answer without a usable minimum", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(respond(426, { code: "client_too_old", min_version: 2 }))
    await http("https://api.test/x")
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ [UPDATE_REQUIRED_KEY]: { minVersion: null, at: expect.any(Number) } })
  })

  it("ignores a 426 that is not about the client's version, or has no JSON body", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(respond(426, { code: "upgrade_protocol" }))
    await http("https://api.test/x")
    vi.mocked(fetch).mockResolvedValueOnce({ status: 426, ok: false, clone: () => ({ json: async () => { throw new SyntaxError("html") } }) } as unknown as Response)
    await http("https://api.test/x")
    expect(chrome.storage.local.set).not.toHaveBeenCalled()
  })

  it("survives a context without a manifest or storage", async () => {
    delete runtime.getManifest
    expect(clientVersion()).toBe("0.0.0")
    vi.mocked(chrome.storage.local.set).mockRejectedValueOnce(new Error("no context"))
    await expect(markClientTooOld(undefined)).resolves.toBeUndefined()
  })
})
