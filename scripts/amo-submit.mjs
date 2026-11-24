#!/usr/bin/env node
/**
 * Sends a Firefox build to AMO with the tag's source code attached (the build
 * is bundled and minified; git archive carries SOURCE_BUILD.md) as a new
 * version of the public listing. AMO review can take days, so the submission
 * does not wait for it.
 *
 *   AMO_JWT_ISSUER=… AMO_JWT_SECRET=… node scripts/amo-submit.mjs --tag=v0.2.0 [--source-dir=build/firefox-mv3-prod]
 *
 * The first version of the listing is created once by hand in the AMO
 * Developer Hub (listing details, categories); this adds later versions.
 */
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

export const REQUIRED_ENV = ["AMO_JWT_ISSUER", "AMO_JWT_SECRET"]
const WEB_EXT = resolve("tools/web-ext/node_modules/.bin/web-ext")

export function missingEnv(env) {
  return REQUIRED_ENV.filter((k) => !env[k])
}

/** `git archive` arguments for the tag's source, which carries SOURCE_BUILD.md. */
export function sourceArchiveArgs(tag, out) {
  return ["archive", "--format=zip", `--output=${out}`, tag]
}

/** `web-ext sign` arguments for the listed channel, with the source attached; it does not wait for the review. */
export function signArgs({ sourceDir, sourceArchive, artifactsDir }) {
  return ["sign", "--channel=listed", `--source-dir=${sourceDir}`, `--upload-source-code=${sourceArchive}`, `--artifacts-dir=${artifactsDir}`, "--approval-timeout=0"]
}

/** The keys reach web-ext through its own environment variables, never the command line. */
export function signEnv(env) {
  return { ...env, WEB_EXT_API_KEY: env.AMO_JWT_ISSUER, WEB_EXT_API_SECRET: env.AMO_JWT_SECRET }
}

function main() {
  const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
  const tag = arg("tag")
  const sourceDir = resolve(arg("source-dir") ?? "build/firefox-mv3-prod")
  if (!tag) {
    console.error("Pass --tag=<release tag>.")
    process.exit(2)
  }
  const missing = missingEnv(process.env)
  if (missing.length) {
    console.error(`Missing ${missing.join(", ")}.`)
    process.exit(2)
  }
  const work = mkdtempSync(join(tmpdir(), "flextab-amo-"))
  try {
    const sourceArchive = join(work, `flextab-source-${tag}.zip`)
    execFileSync("git", sourceArchiveArgs(tag, sourceArchive), { stdio: "inherit" })
    const artifactsDir = join(work, "artifacts")
    execFileSync(WEB_EXT, signArgs({ sourceDir, sourceArchive, artifactsDir }), { stdio: "inherit", env: signEnv(process.env) })
    console.log(`Submitted ${tag} to AMO as a listed version, with its source. Review happens on AMO.`)
  } catch (err) {
    console.error(`✖ AMO submission failed: ${err.message}`)
    process.exit(1)
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
