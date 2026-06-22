#!/usr/bin/env node
/**
 * Guards `plasmo build` against shipping a broken release.
 *
 * `.env.production` is gitignored, so a build on a fresh clone / CI without it
 * would silently fall back to http://localhost:3000 and still "succeed" — a
 * release that looks fine but points at nothing. This fails the build loudly
 * instead. Set ALLOW_LOCALHOST_BUILD=1 to bypass for local prod-bundle testing.
 */
import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"

const RED = "\x1b[31m"
const YELLOW = "\x1b[33m"
const RESET = "\x1b[0m"

function parseEnvFile(path) {
  if (!existsSync(path)) return {}
  const out = {}
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim()
    if (!line || line.startsWith("#")) continue
    const eq = line.indexOf("=")
    if (eq === -1) continue
    out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
  }
  return out
}

// process.env wins (lets CI inject values), then .env.production.
const fileEnv = parseEnvFile(resolve(process.cwd(), ".env.production"))
const get = (k) => process.env[k] ?? fileEnv[k]

const errors = []
const apiUrl = get("PLASMO_PUBLIC_API_URL")
const apiHost = get("PLASMO_PUBLIC_API_HOST")
const allowLocalhost = process.env.ALLOW_LOCALHOST_BUILD === "1"

if (!apiUrl) {
  errors.push("PLASMO_PUBLIC_API_URL is not set (create .env.production from .env.example).")
} else if (!allowLocalhost && /localhost|127\.0\.0\.1/.test(apiUrl)) {
  errors.push(`PLASMO_PUBLIC_API_URL points at localhost ("${apiUrl}"). Set the deployed backend URL.`)
}

if (!apiHost) {
  errors.push("PLASMO_PUBLIC_API_HOST is not set (needed for manifest host_permissions).")
} else {
  if (!allowLocalhost && /localhost|127\.0\.0\.1/.test(apiHost)) {
    errors.push(`PLASMO_PUBLIC_API_HOST points at localhost ("${apiHost}"). Set the deployed backend host.`)
  }
  if (apiHost.includes("*/*")) {
    errors.push(`PLASMO_PUBLIC_API_HOST is too broad ("${apiHost}"). Scope it to the API host only.`)
  }
  if (!apiHost.endsWith("/*")) {
    errors.push(`PLASMO_PUBLIC_API_HOST must be a match pattern ending in /* (got "${apiHost}").`)
  }
}

if (errors.length > 0) {
  console.error(`\n${RED}✖ Build blocked — environment is not release-ready:${RESET}`)
  for (const e of errors) console.error(`${RED}  • ${e}${RESET}`)
  if (/localhost|127\.0\.0\.1/.test(`${apiUrl}${apiHost}`)) {
    console.error(`\n${YELLOW}  (For an intentional local prod-bundle test: ALLOW_LOCALHOST_BUILD=1 npm run build)${RESET}`)
  }
  console.error("")
  process.exit(1)
}

console.log(`✓ env OK — API ${apiUrl}, host_permissions ${apiHost}`)
