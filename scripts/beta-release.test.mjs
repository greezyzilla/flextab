import { describe, expect, it, vi } from "vitest"

import { BETA_UPDATE_URL, betaTagProblem, channelPlan } from "./channel.mjs"
import { PUBLISH_TYPES, publishStaged } from "./cws-publish.mjs"
import { updatesJson } from "./firefox-updates.mjs"

describe("a pushed beta tag (TASK-118)", () => {
  const betaTags = ["beta-v0.1.0.3", "beta-v0.1.0.7"]

  it("may be released when well formed, on dev and above every earlier beta", () => {
    expect(betaTagProblem({ tag: "beta-v0.1.0.9", betaTags: [...betaTags, "beta-v0.1.0.9"], onDev: true })).toBeNull()
    expect(betaTagProblem({ tag: "beta-v0.2.0.1", betaTags, onDev: true })).toBeNull()
    expect(betaTagProblem({ tag: "beta-v0.1.0.1", betaTags: [], onDev: true })).toBeNull()
  })

  it.each([
    ["a wrong format", { tag: "beta-v0.1.0", onDev: true }, /form beta-vX.Y.Z.N/],
    ["a release tag", { tag: "v0.2.0", onDev: true }, /form beta-vX.Y.Z.N/],
    ["a commit not on dev", { tag: "beta-v0.1.0.9", onDev: false }, /not on dev/],
    ["a version below the last beta", { tag: "beta-v0.1.0.5", onDev: true }, /not above the last beta tag beta-v0.1.0.7/],
    ["an older base than the last beta", { tag: "beta-v0.0.9.40", onDev: true }, /not above/],
  ])("is refused before building for %s", (_, input, message) => {
    expect(betaTagProblem({ betaTags, ...input })).toMatch(message)
  })
})

describe("Firefox Beta updates itself from a fixed address (TASK-118)", () => {
  it("only the beta build carries update_url, pointing at the permanent firefox-beta release", () => {
    expect(channelPlan("beta", { betaTag: "beta-v0.1.0.7" }).env.FLEXTAB_GECKO_UPDATE_URL).toBe(BETA_UPDATE_URL)
    expect(channelPlan("stable").env).not.toHaveProperty("FLEXTAB_GECKO_UPDATE_URL")
    expect(BETA_UPDATE_URL).toMatch(/\/releases\/download\/firefox-beta\/updates\.json$/)
  })

  it("writes updates.json in Firefox's self-hosted format", () => {
    expect(updatesJson({ version: "0.1.0.7", link: "https://x/flextab-beta-0.1.0.7.xpi", sha256: "abc" })).toEqual({
      addons: { "flextab-beta@flextabmanager.com": { updates: [{ version: "0.1.0.7", update_link: "https://x/flextab-beta-0.1.0.7.xpi", update_hash: "sha256:abc" }] } },
    })
  })
})

describe("Chrome Web Store publish mode (TASK-118)", () => {
  it("submits beta as a default publish: live for testers once approved", async () => {
    const bodies = []
    const request = vi.fn(async (url, init) => {
      if (String(url).includes(":publish")) bodies.push(JSON.parse(init.body))
      return { ok: true, status: 200, json: async () => (String(url).includes("oauth2") ? { access_token: "t" } : { uploadState: "SUCCEEDED" }) }
    })
    const env = { CWS_CLIENT_ID: "a", CWS_CLIENT_SECRET: "b", CWS_REFRESH_TOKEN: "c", CWS_PUBLISHER_ID: "p", CWS_ITEM_ID: "beta" }
    await publishStaged({ zip: Buffer.from(""), env, publishType: PUBLISH_TYPES.default, fetch: request })
    expect(bodies).toEqual([{ publishType: "DEFAULT_PUBLISH" }])
  })
})
