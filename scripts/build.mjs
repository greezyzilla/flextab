#!/usr/bin/env node
/**
 * Builds the release channel (see scripts/channel.mjs):
 *
 *   node scripts/build.mjs --channel=stable [--zip] [--target=chrome-mv3]
 *
 * Output: build/<target>-prod[.zip].
 */
import { spawnSync } from "node:child_process"

import { channelPlan, resolveChannel } from "./channel.mjs"
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

plasmo(["build", `--tag=${plan.tag}`, `--target=${target}`, ...(zip ? ["--zip"] : [])], plan.env)
