#!/usr/bin/env node
/**
 * Waits for Mozilla to sign a release's Firefox package and downloads it, for
 * the GitHub Release. AMO signs a listed version after its automatic review,
 * which took about 3.5 minutes for 0.1.3; this polls AMO's public API until the
 * version is public or --wait-minutes runs out (then exits 1, so the release
 * job shows red and a rerun only waits again, it never resubmits).
 *
 *   node scripts/amo-signed-xpi.mjs --tag=v0.1.3 --out=flextab-0.1.3-firefox.xpi --wait-minutes=30
 *
 * The download is checked against the SHA-256 AMO publishes for it.
 */
import { createHash } from "node:crypto"
import { writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

export const ADDON = "flextab"
const POLL_MS = 30_000

export function versionUrl(version) {
  return `https://addons.mozilla.org/api/v5/addons/addon/${ADDON}/versions/${encodeURIComponent(version)}/`
}

/** The signed file of an AMO version, or null while it is not approved and public. */
export function signedFile(version) {
  const file = version?.file
  if (!file || file.status !== "public" || typeof file.url !== "string") return null
  const [algo, digest] = String(file.hash ?? "").split(":")
  if (algo !== "sha256" || !/^[0-9a-f]{64}$/.test(digest ?? "")) return null
  return { url: file.url, sha256: digest }
}

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex")
}

/** Polls until the version is signed; null when the deadline passes first. */
export async function waitForSignedFile(version, { deadline, now = Date.now, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), get = fetch } = {}) {
  for (;;) {
    const res = await get(versionUrl(version))
    if (res.ok) {
      const file = signedFile(await res.json())
      if (file) return file
    } else if (res.status !== 404) {
      throw new Error(`AMO answered ${res.status} for ${version}`)
    }
    if (now() + POLL_MS > deadline) return null
    await sleep(POLL_MS)
  }
}

async function main() {
  const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
  const tag = arg("tag")
  const out = arg("out")
  const waitMinutes = Number(arg("wait-minutes") ?? 0)
  if (!tag || !out || !Number.isFinite(waitMinutes) || waitMinutes < 0) {
    console.error("Pass --tag=<release tag>, --out=<file> and optionally --wait-minutes=<n>.")
    process.exit(2)
  }
  const version = tag.replace(/^v/, "")
  console.log(`Waiting up to ${waitMinutes} min for Mozilla to sign ${version}...`)
  const file = await waitForSignedFile(version, { deadline: Date.now() + waitMinutes * 60_000 })
  if (!file) throw new Error(`AMO has not signed ${version} within ${waitMinutes} min (held for manual review?). Rerun this job once it is approved.`)
  const download = await fetch(file.url)
  if (!download.ok) throw new Error(`Download failed: ${download.status}`)
  const bytes = Buffer.from(await download.arrayBuffer())
  if (sha256(bytes) !== file.sha256) throw new Error("The signed package does not match the SHA-256 AMO publishes")
  writeFileSync(out, bytes)
  console.log(`Saved ${out}: the package Mozilla signed for ${version}.`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`✖ ${err.message}`)
    process.exit(1)
  })
}
