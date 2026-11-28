import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign } from "node:crypto"
import { describe, expect, it } from "vitest"

import { checkCrx, idOf, parseUpdate, updateUrl, waitForPublished } from "./cws-signed-crx.mjs"

// A CRX3 file built the way the store builds one: the zip, signed by the item's key and by a second key.
const varint = (n) => { const out = []; while (n > 0x7f) { out.push((n & 0x7f) | 0x80); n >>>= 7 } out.push(n); return Buffer.from(out) }
const field = (number, bytes) => Buffer.concat([varint((number << 3) | 2), varint(bytes.length), bytes])
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b }
const newKey = () => createPrivateKey(generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } }).privateKey)
const der = (key) => createPublicKey(key).export({ type: "spki", format: "der" })

function buildCrx(zip, itemKey, signers) {
  const crxId = createHash("sha256").update(der(itemKey)).digest().subarray(0, 16)
  const signedHeaderData = field(1, crxId)
  const message = Buffer.concat([Buffer.from("CRX3 SignedData\x00"), u32(signedHeaderData.length), signedHeaderData, zip])
  const proofs = signers.map((key) => field(2, Buffer.concat([field(1, der(key)), field(2, sign("sha256", message, key))])))
  const header = Buffer.concat([...proofs, field(10000, signedHeaderData)])
  return Buffer.concat([Buffer.from("Cr24"), u32(3), u32(header.length), header, zip])
}

const itemKey = newKey()
const storeKey = newKey()
const itemId = idOf(der(itemKey))
const zip = Buffer.from("PK\x03\x04 a stand-in zip archive")

describe("Chrome Web Store signed package", () => {
  it("asks Chrome's update service about the item", () => {
    const url = new URL(updateUrl(itemId))
    expect(url.host).toBe("clients2.google.com")
    expect(url.searchParams.get("x")).toBe(`id=${itemId}&v=0.0.0&uc`)
    expect(url.searchParams.get("acceptformat")).toBe("crx3")
  })

  it("reads the served version and download from the update answer", () => {
    const xml = `<gupdate><app appid="${itemId}" status="ok"><updatecheck codebase="https://clients2.googleusercontent.com/crx/blobs/x/A_0_1_3_0.crx?a=1&amp;b=2" fp="1" hash="" status="ok" version="0.1.3"/></app></gupdate>`
    expect(parseUpdate(xml)).toEqual({ version: "0.1.3", codebase: "https://clients2.googleusercontent.com/crx/blobs/x/A_0_1_3_0.crx?a=1&b=2" })
    expect(parseUpdate(`<gupdate><app status="ok"><updatecheck status="noupdate"/></app></gupdate>`)).toBeNull()
    expect(parseUpdate(`<updatecheck codebase="http://insecure/x.crx" version="0.1.3"/>`)).toBeNull()
    expect(parseUpdate("")).toBeNull()
  })

  it("accepts the item's package signed by its own key next to the store's", () => {
    expect(() => checkCrx(buildCrx(zip, itemKey, [itemKey, storeKey]), itemId)).not.toThrow()
  })

  it("rejects a package for another id, one signed only by another key, a changed one, and a non-CRX3 file", () => {
    expect(() => checkCrx(buildCrx(zip, itemKey, [itemKey]), idOf(der(storeKey)))).toThrow("another extension id")
    expect(() => checkCrx(buildCrx(zip, itemKey, [storeKey]), itemId)).toThrow("no valid signature")
    const changed = buildCrx(zip, itemKey, [itemKey])
    changed[changed.length - 1] ^= 1
    expect(() => checkCrx(changed, itemId)).toThrow("no valid signature")
    expect(() => checkCrx(zip, itemId)).toThrow("Not a CRX3")
  })

  describe("waiting for the store", () => {
    const xml = (version) => ({ ok: true, status: 200, text: async () => `<updatecheck codebase="https://x/${version}.crx" version="${version}"/>` })

    it("polls while the store still serves the previous version", async () => {
      let t = 0
      const list = [xml("0.1.2"), xml("0.1.2"), xml("0.1.3")]
      const lines = []
      const update = await waitForPublished(itemId, "0.1.3", { deadline: 10 * 60_000, now: () => t, sleep: async (ms) => { t += ms }, get: async () => list.shift(), log: (l) => lines.push(l) })
      expect(update).toEqual({ version: "0.1.3", codebase: "https://x/0.1.3.crx" })
      expect(lines).toEqual(["The store serves 0.1.2 so far.", "The store serves 0.1.2 so far."])
    })

    it("gives up at the deadline instead of hanging the release", async () => {
      let t = 0
      expect(await waitForPublished(itemId, "0.1.3", { deadline: 5 * 60_000, now: () => t, sleep: async (ms) => { t += ms }, get: async () => xml("0.1.2") })).toBeNull()
      expect(t).toBeLessThanOrEqual(5 * 60_000)
    })

    it("stops when the update service fails", async () => {
      await expect(waitForPublished(itemId, "0.1.3", { deadline: 60_000, get: async () => ({ ok: false, status: 503 }) })).rejects.toThrow("503")
    })
  })
})
