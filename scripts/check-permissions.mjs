#!/usr/bin/env node
/**
 * A release must not add a required permission by accident. When an
 * update asks for a new required permission or host, Chrome disables FlexTab
 * until the user accepts it (Firefox holds the update back the same way), which
 * looks like FlexTab broke. New capabilities use optional permissions, asked
 * for in context (as tab groups does). permissions.lock.json records what is
 * required today; this checks the BUILT manifests against it.
 *
 *   node scripts/check-permissions.mjs build/chrome-mv3-prod build/chrome-mv3-beta build/firefox-mv3-prod
 *       fails on any required permission, host, content script match or
 *       Firefox required data that the lock does not list; removals pass
 *   node scripts/check-permissions.mjs --lock-commits=<from>..<to>
 *       fails on a commit that changes the lock without changing the manifest
 *       (package.json or src/contents/), so the lock changes only on purpose
 */
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

export const LOCK_FILE = "permissions.lock.json"
/** Where the API host stands in the lock: its value comes from the build environment. */
export const API_HOST_TOKEN = "$API_HOST"
/** Files that make up the manifest: a lock change belongs in a commit that touches one. */
const MANIFEST_SOURCES = [/^package\.json$/, /^src\/contents\//]

const sorted = (xs) => [...new Set(xs)].sort()

/** Firefox builds keep browser_specific_settings.gecko; Chrome builds drop it. */
export function browserOf(manifest) {
  return manifest.browser_specific_settings?.gecko ? "firefox" : "chrome"
}

/** What a manifest requires the user to grant, with the API host written as a token. */
export function requiredOf(manifest, apiHost) {
  const required = {
    permissions: sorted(manifest.permissions ?? []),
    host_permissions: sorted((manifest.host_permissions ?? []).map((h) => (h === apiHost ? API_HOST_TOKEN : h))),
    content_scripts: sorted((manifest.content_scripts ?? []).flatMap((cs) => cs.matches ?? [])),
  }
  const data = manifest.browser_specific_settings?.gecko?.data_collection_permissions?.required
  if (data) required.data_collection_required = sorted(data)
  return required
}

/** Entries in `actual` missing from `locked` (added), and the reverse (removed). */
export function compareRequired(locked = {}, actual) {
  const added = []
  const removed = []
  for (const kind of new Set([...Object.keys(locked), ...Object.keys(actual)])) {
    const was = new Set(locked[kind] ?? [])
    const now = new Set(actual[kind] ?? [])
    for (const value of now) if (!was.has(value)) added.push({ kind, value })
    for (const value of was) if (!now.has(value)) removed.push({ kind, value })
  }
  return { added, removed }
}

/** Commits ([sha, files]) that change the lock without changing the manifest. */
export function lockOnlyCommits(commits) {
  return commits.filter(([, files]) => files.includes(LOCK_FILE) && !files.some((f) => MANIFEST_SOURCES.some((re) => re.test(f))))
}

function apiHostFromEnv() {
  if (process.env.PLASMO_PUBLIC_API_HOST) return process.env.PLASMO_PUBLIC_API_HOST
  const file = resolve(".env.production")
  if (!existsSync(file)) return undefined
  const line = readFileSync(file, "utf8").split("\n").find((l) => l.trim().startsWith("PLASMO_PUBLIC_API_HOST="))
  return line?.slice(line.indexOf("=") + 1).trim()
}

function checkLockCommits(range) {
  const shas = execFileSync("git", ["log", "--format=%H", range], { encoding: "utf8" }).split("\n").filter(Boolean)
  const commits = shas.map((sha) => [sha, execFileSync("git", ["show", "--name-only", "--format=", sha], { encoding: "utf8" }).split("\n").filter(Boolean)])
  const bad = lockOnlyCommits(commits)
  if (bad.length === 0) {
    console.log(`${commits.length} commit(s) in ${range}: ${LOCK_FILE} changes only with the manifest.`)
    return 0
  }
  console.error(`\n✖ ${LOCK_FILE} changed without the manifest in:`)
  for (const [sha] of bad) console.error(`  ${sha.slice(0, 7)}`)
  console.error(`Change the lock in the same commit as the manifest change it records.\n`)
  return 1
}

function checkBuilds(dirs) {
  const lock = JSON.parse(readFileSync(resolve(LOCK_FILE), "utf8"))
  const apiHost = apiHostFromEnv()
  let failed = false
  for (const dir of dirs) {
    const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"))
    const browser = browserOf(manifest)
    const { added, removed } = compareRequired(lock[browser], requiredOf(manifest, apiHost))
    for (const r of removed) console.log(`  ${dir}: ${r.kind} "${r.value}" is no longer required. Remove it from ${LOCK_FILE} in this commit.`)
    if (added.length === 0) {
      console.log(`✓ ${dir} (${browser}): no new required permission`)
      continue
    }
    failed = true
    console.error(`✖ ${dir} (${browser}) adds what users would have to grant again:`)
    for (const a of added) console.error(`    ${a.kind}: ${a.value}`)
  }
  if (failed) {
    console.error(`\nA new required permission disables FlexTab for every user until they accept it.`)
    console.error(`Use optional_permissions and ask in context. If it truly must be required, add it to ${LOCK_FILE}`)
    console.error(`in the same commit as the manifest change, and plan the release for it (RELEASING.md).\n`)
  }
  return failed ? 1 : 0
}

function main() {
  const range = process.argv.find((a) => a.startsWith("--lock-commits="))?.slice("--lock-commits=".length)
  if (range) process.exit(checkLockCommits(range))
  const dirs = process.argv.slice(2).filter((a) => !a.startsWith("--"))
  if (dirs.length === 0) {
    console.error("Pass the build folders to check, e.g. build/chrome-mv3-prod build/firefox-mv3-prod.")
    process.exit(2)
  }
  process.exit(checkBuilds(dirs))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
