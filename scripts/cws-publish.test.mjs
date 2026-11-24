import { describe, expect, it, vi } from "vitest"

import { REQUIRED_ENV, missingEnv, publishStaged } from "./cws-publish.mjs"

const env = { CWS_CLIENT_ID: "id", CWS_CLIENT_SECRET: "secret", CWS_REFRESH_TOKEN: "refresh", CWS_PUBLISHER_ID: "pub", CWS_ITEM_ID: "item" }
const answer = (status, body) => ({ ok: status < 300, status, json: async () => body })

describe("Chrome Web Store staged publish", () => {
  it("names every missing secret", () => {
    expect(missingEnv({})).toEqual(REQUIRED_ENV)
    expect(missingEnv(env)).toEqual([])
  })

  it("gets a token, uploads the zip to the item, then submits a STAGED publish", async () => {
    const calls = []
    const request = vi.fn(async (url, init) => {
      calls.push([url, init])
      if (url.includes("oauth2")) return answer(200, { access_token: "tok" })
      if (url.includes(":upload")) return answer(200, { uploadState: "SUCCEEDED" })
      return answer(200, { state: "PENDING_REVIEW" })
    })
    const zip = Buffer.from("zip")
    expect(await publishStaged({ zip, env, fetch: request })).toEqual({ state: "PENDING_REVIEW" })

    expect(calls[0][0]).toBe("https://oauth2.googleapis.com/token")
    expect(String(calls[0][1].body)).toContain("grant_type=refresh_token")
    expect(calls[1][0]).toBe("https://chromewebstore.googleapis.com/upload/v2/publishers/pub/items/item:upload?uploadType=media")
    expect(calls[1][1]).toMatchObject({ method: "POST", body: zip, headers: { Authorization: "Bearer tok" } })
    expect(calls[2][0]).toBe("https://chromewebstore.googleapis.com/v2/publishers/pub/items/item:publish")
    expect(JSON.parse(calls[2][1].body)).toEqual({ publishType: "STAGED_PUBLISH" })
  })

  it("stops before publishing when the upload fails", async () => {
    const request = vi.fn(async (url) => (url.includes("oauth2") ? answer(200, { access_token: "tok" }) : answer(200, { uploadState: "FAILED", itemError: [{ error_code: "PKG_INVALID" }] })))
    await expect(publishStaged({ zip: Buffer.from(""), env, fetch: request })).rejects.toThrow(/rejected the upload/)
    expect(request).toHaveBeenCalledTimes(2)
  })

  it("reports which step the API refused", async () => {
    const request = vi.fn(async () => answer(401, { error: "invalid_grant" }))
    await expect(publishStaged({ zip: Buffer.from(""), env, fetch: request })).rejects.toThrow(/Getting an access token failed \(401\)/)
  })
})
