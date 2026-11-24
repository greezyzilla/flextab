#!/usr/bin/env node
/**
 * The beta workflow's first job: refuse a pushed beta tag before
 * anything is built when its format is wrong, its commit is not on dev, or its
 * version is not above every earlier beta tag (scripts/channel.mjs).
 *
 *   node scripts/check-beta-tag.mjs beta-v0.2.0.3      (needs origin/dev fetched)
 */
import { execFileSync, spawnSync } from "node:child_process"

import { betaTagProblem } from "./channel.mjs"

const tag = process.argv[2]
// Only betas released from dev count: a tag refused for pointing elsewhere must not block the next one.
const betaTags = execFileSync("git", ["tag", "--list", "beta-v*", "--merged", "origin/dev"], { encoding: "utf8" }).split("\n").filter(Boolean)
const onDev = Boolean(tag) && spawnSync("git", ["merge-base", "--is-ancestor", `${tag}^{commit}`, "origin/dev"]).status === 0
const problem = betaTagProblem({ tag, betaTags, onDev })
if (problem) {
  console.error(`✖ ${problem}`)
  process.exit(1)
}
console.log(`${tag} may be released.`)
