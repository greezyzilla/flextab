import { describe, expect, it } from "vitest"

import { sha256, signedFile, versionUrl, waitForSignedFile } from "./amo-signed-xpi.mjs"

const hash = "a".repeat(64)

describe("AMO signed package", () => {
  it("asks AMO's public API for the release's version", () => {
    expect(versionUrl("0.1.3")).toBe("https://addons.mozilla.org/api/v5/addons/addon/flextab/versions/0.1.3/")
  })

  it("takes the file only once the version is public, with its SHA-256", () => {
    const url = "https://addons.mozilla.org/firefox/downloads/file/1/flextab-0.1.3.xpi"
    expect(signedFile({ file: { status: "public", url, hash: `sha256:${hash}` } })).toEqual({ url, sha256: hash })
  })

  it("waits while the version is in review or the answer has no usable hash", () => {
    expect(signedFile({ file: { status: "unreviewed", url: "x", hash: `sha256:${hash}` } })).toBeNull()
    expect(signedFile({ file: { status: "public", url: "x", hash: "md5:abc" } })).toBeNull()
    expect(signedFile({})).toBeNull()
    expect(signedFile(null)).toBeNull()
  })

  it("hashes a download the way AMO publishes it", () => {
    expect(sha256(Buffer.from("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
  })

  describe("waiting for the signature", () => {
    const url = "https://addons.mozilla.org/firefox/downloads/file/1/flextab-0.1.3.xpi"
    const answers = (...list) => {
      const calls = []
      const get = async (u) => { calls.push(u); return list.shift() }
      return { get, calls }
    }
    const json = (body) => ({ ok: true, status: 200, json: async () => body })
    const missing = { ok: false, status: 404 }

    it("polls through 'not there yet' and 'in review' until the version is public", async () => {
      let t = 0
      const { get, calls } = answers(missing, json({ file: { status: "unreviewed" } }), json({ file: { status: "public", url, hash: `sha256:${hash}` } }))
      const file = await waitForSignedFile("0.1.3", { deadline: 10 * 60_000, now: () => t, sleep: async (ms) => { t += ms }, get })
      expect(file).toEqual({ url, sha256: hash })
      expect(calls).toHaveLength(3)
    })

    it("gives up at the deadline instead of hanging the release", async () => {
      let t = 0
      const get = async () => json({ file: { status: "unreviewed" } })
      expect(await waitForSignedFile("0.1.3", { deadline: 60_000, now: () => t, sleep: async (ms) => { t += ms }, get })).toBeNull()
      expect(t).toBeLessThanOrEqual(60_000)
    })

    it("stops on an AMO error instead of waiting it out", async () => {
      await expect(waitForSignedFile("0.1.3", { deadline: 60_000, get: async () => ({ ok: false, status: 500 }) })).rejects.toThrow("500")
    })
  })
})
