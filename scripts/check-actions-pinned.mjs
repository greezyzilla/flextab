#!/usr/bin/env node
/**
 * Every external GitHub Action is pinned to a full commit SHA (TASK-116). A tag
 * like @v4 can be moved to new code by whoever controls the action; a SHA cannot.
 * Local workflows (./...) are ours and need no pin.
 *
 *   node scripts/check-actions-pinned.mjs [workflow directory]
 */
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const USES = /^\s*-?\s*uses:\s*["']?([^"'\s#]+)/

/** The `uses:` references in a workflow that are neither local nor pinned to a SHA, with their line. */
export function unpinned(text) {
  return text.split("\n").flatMap((line, i) => {
    const ref = USES.exec(line)?.[1]
    if (!ref || ref.startsWith("./")) return []
    return /@[0-9a-f]{40}$/.test(ref) ? [] : [{ line: i + 1, ref }]
  })
}

function main() {
  const dir = process.argv[2] ?? ".github/workflows"
  const found = readdirSync(dir)
    .filter((f) => /\.ya?ml$/.test(f))
    .flatMap((f) => unpinned(readFileSync(join(dir, f), "utf8")).map((u) => `${join(dir, f)}:${u.line} ${u.ref}`))
  if (found.length === 0) {
    console.log("Every external action is pinned to a commit SHA.")
    return
  }
  console.error(`\n✖ Actions not pinned to a full commit SHA:\n  ${found.join("\n  ")}\nPin each to its 40-character SHA, with the version as a comment.\n`)
  process.exit(1)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
