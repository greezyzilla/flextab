#!/usr/bin/env node
/**
 * Builds a channel (see scripts/channel.mjs):
 *
 *   node scripts/build.mjs --channel=stable|dev [--zip] [--target=chrome-mv3]
 *
 * Output: build/<target>-<tag>[.zip]: -prod for stable, -dev for dev.
 */
import { spawnSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"

import { channelPlan, patchManifest, resolveChannel } from "./channel.mjs"
import { runningWatcher } from "./dev-lock.mjs"

const RED = "\x1b[31m"
const RESET = "\x1b[0m"

const argv = process.argv.slice(2)

// A build shares .plasmo/ with a running `plasmo dev` and can hand it
// production files (scripts/dev-lock.mjs). Stop instead.
const watcher = runningWatcher(process.cwd())
if (watcher) {
  console.error(`\n${RED}✖ Build blocked: npm run dev is running in this checkout (PID ${watcher}).${RESET}`)
  console.error("  A build here would share .plasmo/ with the watcher and can give the dev extension production values.")
  console.error("  Stop the watcher, or build in a separate worktree:")
  console.error("    git worktree add ../flextab-build HEAD && cd ../flextab-build && npm ci && npm run build\n")
  process.exit(1)
}
const flag = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)

function plasmo(args, env) {
  const result = spawnSync("npx", ["plasmo", ...args], { stdio: "inherit", env: { ...process.env, ...env } })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

let plan
try {
  plan = channelPlan(resolveChannel(argv, process.env))
} catch (err) {
  console.error(`\n${RED}✖ Build blocked: ${err.message}${RESET}\n`)
  process.exit(1)
}

const target = flag("target") ?? "chrome-mv3"
const zip = argv.includes("--zip")

console.log(`Building FlexTab ${plan.channel} (${target}, tag ${plan.tag})`)

if (plan.channel === "stable") {
  plasmo(["build", `--tag=${plan.tag}`, `--target=${target}`, ...(zip ? ["--zip"] : [])], plan.env)
} else {
  // Another channel's content scripts must match its own API host (patchManifest),
  // so the manifest is fixed before the zip is made.
  plasmo(["build", `--tag=${plan.tag}`, `--target=${target}`], plan.env)
  const path = `build/${target}-${plan.tag}/manifest.json`
  writeFileSync(path, JSON.stringify(patchManifest(JSON.parse(readFileSync(path, "utf8")), plan.channel), null, 2))
  if (zip) plasmo(["package", `--tag=${plan.tag}`, `--target=${target}`], plan.env)
}
