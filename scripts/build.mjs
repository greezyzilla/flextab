#!/usr/bin/env node
/**
 * Builds one release channel (see scripts/channel.mjs):
 *
 *   node scripts/build.mjs --channel=stable [--zip] [--target=chrome-mv3]
 *   node scripts/build.mjs --channel=beta --beta-tag=beta-v0.1.0.7 [--zip]
 *
 * The beta tag can also come from FLEXTAB_BETA_TAG or a beta-v* tag on HEAD.
 * Output: build/<target>-prod[.zip] for stable, build/<target>-beta[.zip] for beta.
 */
import { execFileSync, spawnSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

import { channelPlan, finalizeManifest, resolveChannel } from "./channel.mjs"

const RED = "\x1b[31m"
const RESET = "\x1b[0m"

const argv = process.argv.slice(2)
const flag = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)

function betaTagOnHead() {
  try {
    return execFileSync("git", ["describe", "--tags", "--exact-match", "--match", "beta-v*", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
  } catch {
    return undefined
  }
}

function plasmo(args, env) {
  const result = spawnSync("npx", ["plasmo", ...args], { stdio: "inherit", env: { ...process.env, ...env } })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

let plan
try {
  const channel = resolveChannel(argv, process.env)
  const betaTag = channel === "beta" ? (flag("beta-tag") ?? process.env.FLEXTAB_BETA_TAG ?? betaTagOnHead()) : undefined
  plan = channelPlan(channel, { betaTag })
} catch (err) {
  console.error(`\n${RED}✖ Build blocked: ${err.message}${RESET}\n`)
  process.exit(1)
}

const target = flag("target") ?? "chrome-mv3"
const zip = argv.includes("--zip")
const common = [`--tag=${plan.tag}`, `--target=${target}`]

console.log(`Building FlexTab ${plan.channel} (${target}, tag ${plan.tag})`)

if (!plan.version) {
  // Stable: today's build, unchanged.
  plasmo(["build", ...common, ...(zip ? ["--zip"] : [])], plan.env)
} else {
  // Beta: build, write the four-part version, then zip what was written.
  plasmo(["build", ...common], plan.env)
  const manifestPath = resolve("build", `${target}-${plan.tag}`, "manifest.json")
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
  writeFileSync(manifestPath, JSON.stringify(finalizeManifest(manifest, plan)))
  console.log(`Manifest version ${plan.version} (${plan.env.FLEXTAB_EXT_VERSION_NAME})`)
  if (zip) plasmo(["package", ...common], plan.env)
}
