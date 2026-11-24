#!/usr/bin/env node
/**
 * `npm run dev`: checks that the dev build will talk to a local API and carry
 * the dev name, then starts `plasmo dev` with the same arguments.
 *
 * The env is resolved the way Plasmo 0.90 does for `plasmo dev`: NODE_ENV is
 * forced to development, the shell's variables win, then the first env file
 * (in the order below) that sets a key. A dev build pointed at the production
 * API would silently use a real account against the real server, so this stops
 * first and says where the value came from. ALLOW_REMOTE_DEV_API=1 lets dev
 * point at a remote API on purpose.
 */
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parseEnv } from "node:util"

export const DEV_NAME = "FlexTab Dev"
export const OPT_IN = "ALLOW_REMOTE_DEV_API"
const KEYS = ["PLASMO_PUBLIC_API_URL", "PLASMO_PUBLIC_API_HOST", "FLEXTAB_EXT_NAME"]
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"])

const flag = (argv, name) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)

/** The env files `plasmo dev` reads, first match first. */
export function devEnvFiles(argv, env) {
  const tag = flag(argv, "tag") || env.PLASMO_TAG || "dev"
  const browser = (flag(argv, "target") || env.PLASMO_TARGET || "chrome-mv3").split("-")[0]
  const nodeEnv = "development" // plasmo dev sets it, whatever the shell says
  return [
    flag(argv, "env"),
    `.env.${browser}.local`, `.env.${tag}.local`, `.env.${nodeEnv}.local`, ".env.local",
    `.env.${browser}`, `.env.${tag}`, `.env.${nodeEnv}`, ".env",
  ].filter(Boolean)
}

/** Each checked key's value and where it came from: the shell wins, then the first file that sets it. */
export function resolveDevEnv(env, files) {
  const out = {}
  for (const key of KEYS) if (env[key] !== undefined) out[key] = { value: env[key], from: "the shell" }
  for (const { name, contents } of files) {
    const parsed = parseEnv(contents)
    for (const key of KEYS) if (!(key in out) && parsed[key] !== undefined) out[key] = { value: parsed[key], from: name }
  }
  return out
}

const isLocal = (url) => {
  try {
    return LOCAL_HOSTS.has(new URL(url.replace("*", "x")).hostname)
  } catch {
    return false
  }
}

/** What would make this dev build something other than a local FlexTab Dev. */
export function devEnvProblems(resolved) {
  const problems = []
  for (const key of ["PLASMO_PUBLIC_API_URL", "PLASMO_PUBLIC_API_HOST"]) {
    const r = resolved[key]
    if (!r) problems.push(`${key} is not set by the shell or any dev env file.`)
    else if (!isLocal(r.value)) problems.push(`${key}=${r.value} (from ${r.from}) is not a localhost address.`)
  }
  const name = resolved.FLEXTAB_EXT_NAME
  if (name?.value !== DEV_NAME) {
    problems.push(`FLEXTAB_EXT_NAME is ${name ? `"${name.value}" (from ${name.from})` : "not set"}, not "${DEV_NAME}".`)
  }
  return problems
}

/** "block" stops before plasmo starts, "warn" starts it after saying why (opt-in), "ok" just starts it. */
export function devGate(problems, env) {
  if (!problems.length) return "ok"
  return env[OPT_IN] === "1" ? "warn" : "block"
}

const RED = "\x1b[31m"
const YELLOW = "\x1b[33m"
const RESET = "\x1b[0m"

function main() {
  const argv = process.argv.slice(2)
  const files = devEnvFiles(argv, process.env)
    .filter((name) => existsSync(resolve(name)))
    .map((name) => ({ name, contents: readFileSync(resolve(name), "utf8") }))
  const problems = devEnvProblems(resolveDevEnv(process.env, files))
  const gate = devGate(problems, process.env)
  if (gate === "block") {
    console.error(`\n${RED}✖ Dev blocked: this build would not be a local FlexTab Dev:${RESET}`)
    for (const p of problems) console.error(`${RED}  • ${p}${RESET}`)
    console.error(`\n  Fix .env.development (see .env.example) or unset the shell variable.`)
    console.error(`${YELLOW}  To point dev at a remote API on purpose: ${OPT_IN}=1 npm run dev${RESET}\n`)
    process.exit(1)
  }
  if (gate === "warn") {
    console.warn(`\n${YELLOW}⚠ ${OPT_IN}=1: dev runs against a remote API on purpose:${RESET}`)
    for (const p of problems) console.warn(`${YELLOW}  • ${p}${RESET}`)
    console.warn("")
  }
  const result = spawnSync("npx", ["plasmo", "dev", ...argv], { stdio: "inherit" })
  process.exit(result.status ?? 1)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
