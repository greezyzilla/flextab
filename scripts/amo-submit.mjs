#!/usr/bin/env node
/**
 * Sends a Firefox build to AMO with the tag's source code attached (the build
 * is bundled and minified; git archive carries SOURCE_BUILD.md).
 *   listed    stable (TASK-117): a new version of the public listing; AMO review
 *             can take days, so the submission does not wait for it.
 *   unlisted  beta (TASK-118): AMO signs it for self-distribution within
 *             minutes; the signed .xpi is copied to --xpi-out.
 *
 *   AMO_JWT_ISSUER=… AMO_JWT_SECRET=… node scripts/amo-submit.mjs --tag=v0.2.0 [--source-dir=build/firefox-mv3-prod]
 *   AMO_JWT_ISSUER=… AMO_JWT_SECRET=… node scripts/amo-submit.mjs --tag=beta-v0.2.0.3 --channel=unlisted \
 *     --source-dir=build/firefox-mv3-beta --xpi-out=flextab-beta-0.2.0.3.xpi
 *
 * The first version of the listing is created once by hand in the AMO
 * Developer Hub (listing details, categories); this adds later versions.
 */
import { execFileSync } from "node:child_process"
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from "node:fs"
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

/**
 * `web-ext sign` arguments, with the source attached. Listed does not wait for
 * the review; unlisted waits for AMO's automatic signing to download the .xpi.
 */
export function signArgs({ channel = "listed", sourceDir, sourceArchive, artifactsDir }) {
  const args = ["sign", `--channel=${channel}`, `--source-dir=${sourceDir}`, `--upload-source-code=${sourceArchive}`, `--artifacts-dir=${artifactsDir}`]
  return channel === "listed" ? [...args, "--approval-timeout=0"] : args
}

/** The keys reach web-ext through its own environment variables, never the command line. */
export function signEnv(env) {
  return { ...env, WEB_EXT_API_KEY: env.AMO_JWT_ISSUER, WEB_EXT_API_SECRET: env.AMO_JWT_SECRET }
}

function main() {
  const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
  const tag = arg("tag")
  const channel = arg("channel") ?? "listed"
  const sourceDir = resolve(arg("source-dir") ?? "build/firefox-mv3-prod")
  const xpiOut = arg("xpi-out")
  if (!tag || !["listed", "unlisted"].includes(channel) || (channel === "unlisted" && !xpiOut)) {
    console.error("Pass --tag=<release tag>, --channel=listed|unlisted, and --xpi-out for unlisted.")
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
    execFileSync(WEB_EXT, signArgs({ channel, sourceDir, sourceArchive, artifactsDir }), { stdio: "inherit", env: signEnv(process.env) })
    if (channel === "listed") {
      console.log(`Submitted ${tag} to AMO as a listed version, with its source. Review happens on AMO.`)
      return
    }
    const signed = readdirSync(artifactsDir).find((f) => f.endsWith(".xpi"))
    if (!signed) throw new Error("AMO signed nothing: no .xpi came back.")
    copyFileSync(join(artifactsDir, signed), resolve(xpiOut))
    console.log(`AMO signed ${tag}: ${xpiOut}`)
  } catch (err) {
    console.error(`✖ AMO submission failed: ${err.message}`)
    process.exit(1)
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
