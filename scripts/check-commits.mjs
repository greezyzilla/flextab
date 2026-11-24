#!/usr/bin/env node
/**
 * Every commit is a Conventional Commit, because release-please reads
 * them to pick the next stable version and write the changelog.
 *
 *   node scripts/check-commits.mjs --range=<from>..<to>     CI: each commit in a push or PR
 *   node scripts/check-commits.mjs --message-file=<path>    the commit-msg hook (.githooks)
 *
 * The commits made before this check keep their messages, so they are listed
 * in EXEMPT instead of fixed.
 */
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

export const TYPES = ["feat", "fix", "build", "ci", "docs", "chore", "refactor", "perf", "test", "style", "revert"]

const CONVENTIONAL = new RegExp(`^(${TYPES.join("|")})(\\([^()\\s][^()]*\\))?!?: \\S`)
// Subjects git writes itself: a merge, and a revert of a commit.
const GIT_WRITTEN = /^(Merge |Revert ")/

/** Commits from before this check, kept as they are. */
export const EXEMPT = new Set([
  "59ccd80baf838e60562771de84a718be63350680",
  "20045cfee16bc0635d3213d0a41265d2190ab73a",
  "cd79629067e6dea94dbf7a24a205d26a1333a845",
  "83eb6242919476d45ec578761b4606dce9f94722",
  "3289f47ac356c63b700f862fbc6765c27a4b1f01",
  "e198eb073fa82b491ff62ef88005fc420e8dda53",
])

export function isConventional(subject) {
  return CONVENTIONAL.test(subject) || GIT_WRITTEN.test(subject)
}

/** The subject of a commit message as git stores it: the first line that is not a comment. */
export function subjectOf(message) {
  return message.split("\n").map((l) => l.trim()).find((l) => l && !l.startsWith("#")) ?? ""
}

/** The commits in `entries` ([sha, subject]) that break the rule. */
export function badCommits(entries) {
  return entries.filter(([sha, subject]) => !EXEMPT.has(sha) && !isConventional(subject))
}

const HELP = `Use <type>(<optional scope>): <summary>, with type one of ${TYPES.join(", ")}.
Add ! before the colon for a breaking change. Example: fix(sync): keep edits made offline`

function main() {
  const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
  const file = arg("message-file")
  const range = arg("range")

  if (file) {
    const subject = subjectOf(readFileSync(file, "utf8"))
    if (!subject || isConventional(subject)) return
    console.error(`\n✖ "${subject}" is not a Conventional Commit.\n${HELP}\n`)
    process.exit(1)
  }

  if (!range) {
    console.error("Pass --range=<from>..<to> or --message-file=<path>.")
    process.exit(2)
  }
  const log = execFileSync("git", ["log", "--no-merges", "--format=%H%x09%s", range], { encoding: "utf8" })
  const entries = log.split("\n").filter(Boolean).map((line) => line.split("\t"))
  const bad = badCommits(entries)
  if (bad.length === 0) {
    console.log(`${entries.length} commit(s) in ${range}: all Conventional Commits.`)
    return
  }
  console.error(`\n✖ ${bad.length} commit(s) in ${range} are not Conventional Commits:`)
  for (const [sha, subject] of bad) console.error(`  ${sha.slice(0, 7)} ${subject}`)
  console.error(`${HELP}\n`)
  process.exit(1)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
