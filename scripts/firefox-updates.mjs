#!/usr/bin/env node
/**
 * Writes the updates.json that installed Firefox Beta copies read through
 * gecko.update_url, in the format Firefox expects for self-hosted
 * add-ons: the newest signed .xpi, its version and its sha256.
 *
 *   node scripts/firefox-updates.mjs --xpi=flextab-beta-0.2.0.3.xpi --version=0.2.0.3 \
 *     --link=https://github.com/…/releases/download/beta-v0.2.0.3/flextab-beta-0.2.0.3.xpi --out=updates.json
 */
import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { GECKO_IDS } from "./channel.mjs"

export function updatesJson({ geckoId = GECKO_IDS.beta, version, link, sha256 }) {
  return { addons: { [geckoId]: { updates: [{ version, update_link: link, update_hash: `sha256:${sha256}` }] } } }
}

function main() {
  const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
  const [xpi, version, link, out] = ["xpi", "version", "link", "out"].map(arg)
  if (!xpi || !version || !link || !out) {
    console.error("Pass --xpi, --version, --link and --out.")
    process.exit(2)
  }
  const sha256 = createHash("sha256").update(readFileSync(xpi)).digest("hex")
  writeFileSync(out, JSON.stringify(updatesJson({ version, link, sha256 }), null, 2) + "\n")
  console.log(`Wrote ${out} for ${version}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
