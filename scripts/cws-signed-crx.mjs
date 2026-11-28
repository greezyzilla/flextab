#!/usr/bin/env node
/**
 * Waits for the Chrome Web Store to publish a release and downloads the .crx
 * Google signed for it, for the GitHub Release. It is the store's own package:
 * same extension id, so Chrome keeps it updated from the store. The release
 * auto-publishes after review (hours for 0.1.3), so this polls Chrome's update
 * service until the store serves the version or --wait-minutes runs out (then
 * exits 1: the job shows red, and a rerun only waits again, it never resubmits).
 *
 *   CWS_ITEM_ID=… node scripts/cws-signed-crx.mjs --tag=v0.1.3 --out=flextab-0.1.3-chrome.crx --wait-minutes=330
 *
 * The download must be a CRX3 file for that item, carrying a valid signature
 * by the item's own key.
 */
import { createHash, createPublicKey, verify } from "node:crypto"
import { writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const POLL_MS = 60_000
const SIGNED_DATA_PREFIX = Buffer.from("CRX3 SignedData\x00")

export function updateUrl(itemId) {
  const x = encodeURIComponent(`id=${itemId}&v=0.0.0&uc`)
  return `https://clients2.google.com/service/update2/crx?response=updatecheck&acceptformat=crx3&prodversion=150.0&x=${x}`
}

/** The version the store serves and where to fetch it, from the update service's XML, or null. */
export function parseUpdate(xml) {
  const check = String(xml).match(/<updatecheck\b[^>]*>/)?.[0]
  if (!check) return null
  const attr = (name) => check.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1]
  const version = attr("version")
  const codebase = attr("codebase")
  if (!version || !codebase?.startsWith("https://")) return null
  return { version, codebase: codebase.replace(/&amp;/g, "&") }
}

/** Length-delimited protobuf fields of one message: { number: [bytes, ...] }. */
function fields(buf) {
  const out = {}
  let i = 0
  const varint = () => {
    let n = 0
    let shift = 0
    let b
    do {
      if (i >= buf.length) throw new Error("Truncated CRX header")
      b = buf[i++]
      n += (b & 0x7f) * 2 ** shift
      shift += 7
    } while (b & 0x80)
    return n
  }
  while (i < buf.length) {
    const key = varint()
    if ((key & 7) !== 2) throw new Error("Unexpected field in CRX header")
    const len = varint()
    ;(out[key >> 3] ||= []).push(buf.subarray(i, i + len))
    i += len
  }
  return out
}

/** 16 bytes written the way Chrome writes extension ids: each hex digit as a-p. */
function asId(bytes) {
  return [...bytes.toString("hex")].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join("")
}

/** Chrome's id for a public key: the first 16 bytes of its SHA-256. */
export function idOf(publicKeyDer) {
  return asId(createHash("sha256").update(publicKeyDer).digest().subarray(0, 16))
}

/** Throws unless crx is a CRX3 file for itemId with a valid signature by the item's key. */
export function checkCrx(crx, itemId) {
  if (crx.subarray(0, 4).toString() !== "Cr24" || crx.readUInt32LE(4) !== 3) throw new Error("Not a CRX3 file")
  const headerLength = crx.readUInt32LE(8)
  const header = fields(crx.subarray(12, 12 + headerLength))
  const signedHeaderData = header[10000]?.[0]
  if (!signedHeaderData) throw new Error("CRX has no signed header data")
  const crxId = fields(signedHeaderData)[1]?.[0]
  if (!crxId || asId(crxId) !== itemId) throw new Error("CRX is for another extension id")
  const len = Buffer.alloc(4)
  len.writeUInt32LE(signedHeaderData.length)
  const message = Buffer.concat([SIGNED_DATA_PREFIX, len, signedHeaderData, crx.subarray(12 + headerLength)])
  const signedByItemKey = (header[2] ?? []).some((proofBytes) => {
    const proof = fields(proofBytes)
    const publicKey = proof[1]?.[0]
    const signature = proof[2]?.[0]
    if (!publicKey || !signature || idOf(publicKey) !== itemId) return false
    return verify("sha256", message, createPublicKey({ key: publicKey, format: "der", type: "spki" }), signature)
  })
  if (!signedByItemKey) throw new Error("CRX carries no valid signature by the item's key")
}

/** Polls until the store serves the version; null when the deadline passes first. */
export async function waitForPublished(itemId, version, { deadline, now = Date.now, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), get = fetch, log = () => {} } = {}) {
  for (;;) {
    const res = await get(updateUrl(itemId))
    if (!res.ok) throw new Error(`Chrome's update service answered ${res.status}`)
    const update = parseUpdate(await res.text())
    if (update?.version === version) return update
    log(`The store serves ${update?.version ?? "nothing"} so far.`)
    if (now() + POLL_MS > deadline) return null
    await sleep(POLL_MS)
  }
}

async function main() {
  const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
  const tag = arg("tag")
  const out = arg("out")
  const waitMinutes = Number(arg("wait-minutes") ?? 0)
  const itemId = process.env.CWS_ITEM_ID
  if (!tag || !out || !Number.isFinite(waitMinutes) || waitMinutes < 0 || !/^[a-p]{32}$/.test(itemId ?? "")) {
    console.error("Pass --tag=<release tag>, --out=<file>, optionally --wait-minutes=<n>, and CWS_ITEM_ID in the environment.")
    process.exit(2)
  }
  const version = tag.replace(/^v/, "")
  console.log(`Waiting up to ${waitMinutes} min for the Chrome Web Store to publish ${version}...`)
  let last = ""
  const log = (line) => { if (line !== last) console.log(line); last = line }
  const update = await waitForPublished(itemId, version, { deadline: Date.now() + waitMinutes * 60_000, log })
  if (!update) throw new Error(`The Chrome Web Store has not published ${version} within ${waitMinutes} min. Rerun this job once it is live.`)
  const download = await fetch(update.codebase)
  if (!download.ok) throw new Error(`Download failed: ${download.status}`)
  const crx = Buffer.from(await download.arrayBuffer())
  checkCrx(crx, itemId)
  writeFileSync(out, crx)
  console.log(`Saved ${out}: the package Google signed for ${version}.`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`✖ ${err.message}`)
    process.exit(1)
  })
}
