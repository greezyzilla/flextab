#!/usr/bin/env node
/**
 * `npm run release:beta`: cuts a FlexTab Beta release in one command.
 *
 *   1. checks: on dev, clean working tree, a stable tag vX.Y.Z in the history,
 *      commits since it, and a version above the last beta tag
 *   2. builds build/chrome-mv3-beta.zip for beta-vX.Y.Z.N
 *   3. creates the local tag beta-vX.Y.Z.N
 *
 * The tag is the last step: if any check or the build fails, the release aborts
 * and no tag is left behind. Pushing the tag stays a manual step.
 */
import { execFileSync, spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

import { nextBetaTag, latestStableTag, parseBetaTag } from "./channel.mjs"

export const BETA_BRANCH = "dev"

/**
 * `git(args)` returns trimmed stdout and throws on failure; `build(tag)` returns
 * true when the beta zip was built. Throws, before any tag exists, on failure.
 */
export function releaseBeta({ git, build, log = () => {} }) {
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"])
  if (branch !== BETA_BRANCH) {
    throw new Error(`A beta is cut from ${BETA_BRANCH}, but HEAD is on "${branch}".`)
  }
  if (git(["status", "--porcelain"]) !== "") {
    throw new Error("The working tree has uncommitted changes. Commit or stash them first, so the tag names exactly what was built.")
  }

  // Tags in dev's history only: the last stable it can reach, and the betas released from it
  // (a stray tag elsewhere must not block or bend the numbering).
  const list = (pattern) => git(["tag", "--list", pattern, "--merged", "HEAD"]).split("\n").filter(Boolean)
  const stableTag = latestStableTag(list("v*"))
  const commitsSince = stableTag ? Number(git(["rev-list", "--count", `${stableTag}..HEAD`])) : 0
  const tag = nextBetaTag({ stableTag, commitsSince, betaTags: list("beta-v*") })

  log(`Releasing ${tag} (${parseBetaTag(tag).versionName})`)
  if (!build(tag)) {
    throw new Error(`The beta build failed, so ${tag} was not created.`)
  }

  git(["tag", "--annotate", tag, "--message", `FlexTab ${parseBetaTag(tag).versionName}`])
  return tag
}

function main() {
  const git = (args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
  const build = (tag) => {
    const run = (cmd, args) => spawnSync(cmd, args, { stdio: "inherit" }).status === 0
    return run("npm", ["run", "check-env"]) && run("node", ["scripts/build.mjs", "--channel=beta", `--beta-tag=${tag}`, "--zip"])
  }
  try {
    const tag = releaseBeta({ git, build, log: console.log })
    console.log(`\nCreated ${tag}. Output: build/chrome-mv3-beta.zip`)
    console.log(`Push it when ready: git push origin ${tag}`)
  } catch (err) {
    console.error(`\n\x1b[31m✖ Beta release aborted: ${err.message}\x1b[0m\n`)
    process.exit(1)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
