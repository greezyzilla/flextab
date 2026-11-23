/**
 * Release channels (TASK-111): one codebase builds two permanent extension items,
 * like Edge Beta next to Edge.
 *
 *   stable  "Flextab", the public item. Exactly today's build: name and version
 *           come from package.json, the build lands in build/<target>-prod.
 *   beta    "FlexTab Beta", the testers' item. Its own name, icon
 *           (assets/icon.beta.png) and Firefox add-on id, so both install side
 *           by side; its version comes from the tag beta-vX.Y.Z.N.
 *
 * Plasmo reads the channel through the `$FLEXTAB_*` placeholders in package.json
 * `manifest`. A placeholder whose variable is unset is dropped, so the manifest
 * keeps package.json's own value: stable sets only the Firefox id.
 *
 * Pure functions only, so the tests can cover both channels without a build.
 */

export const CHANNELS = ["stable", "beta"]

/** Firefox add-on ids. Permanent once uploaded to AMO: never change them after that. */
export const GECKO_IDS = {
  stable: "flextab@flextabmanager.com",
  beta: "flextab-beta@flextabmanager.com",
}

const BETA_NAME = "FlexTab Beta"
const BETA_TAG = /^beta-v(\d+)\.(\d+)\.(\d+)\.(\d+)$/

/**
 * The channel from `--channel=<name>` or FLEXTAB_CHANNEL. A build with no channel
 * fails instead of guessing which item it is.
 */
export function resolveChannel(argv, env) {
  const arg = argv.find((a) => a.startsWith("--channel="))
  const channel = arg ? arg.slice("--channel=".length) : env.FLEXTAB_CHANNEL
  if (!channel) {
    throw new Error(`No release channel set. Pass --channel=stable or --channel=beta (or set FLEXTAB_CHANNEL).`)
  }
  if (!CHANNELS.includes(channel)) {
    throw new Error(`Unknown release channel "${channel}". Use one of: ${CHANNELS.join(", ")}.`)
  }
  return channel
}

/**
 * "beta-v0.1.0.7" -> { version: "0.1.0.7", base: "0.1.0", versionName: "0.1.0 Beta 7" }.
 * X.Y.Z is the last stable version and N the commits since it, so N starts at 1.
 */
export function parseBetaTag(tag) {
  const m = BETA_TAG.exec(tag ?? "")
  if (!m) {
    throw new Error(`Beta tag "${tag ?? ""}" is not in the form beta-vX.Y.Z.N (for example beta-v0.1.0.7).`)
  }
  const parts = m.slice(1).map(Number)
  if (parts.some((n) => n > 65535) || m.slice(1).some((s) => s.length > 1 && s.startsWith("0"))) {
    throw new Error(`Beta tag "${tag}" needs integers from 0 to 65535 without leading zeros.`)
  }
  if (parts[3] < 1) {
    throw new Error(`Beta tag "${tag}" has build number 0. N counts the commits since the last stable tag, so it starts at 1.`)
  }
  const base = parts.slice(0, 3).join(".")
  return { version: parts.join("."), base, versionName: `${base} Beta ${parts[3]}` }
}

/**
 * Everything a build of `channel` needs:
 *   tag      Plasmo's --tag: picks assets/icon.<tag>.png and build/<target>-<tag>
 *   env      the FLEXTAB_* values the package.json manifest placeholders read, and
 *            PLASMO_PUBLIC_FLEXTAB_CHANNEL, which the code sends as X-Client-Channel
 *   version  the final manifest version, written after the build (see build.mjs)
 */
export function channelPlan(channel, { betaTag } = {}) {
  if (channel === "stable") {
    return { channel, tag: "prod", env: { FLEXTAB_GECKO_ID: GECKO_IDS.stable, PLASMO_PUBLIC_FLEXTAB_CHANNEL: "stable" }, version: null }
  }
  if (channel === "beta") {
    const { version, base, versionName } = parseBetaTag(betaTag)
    return {
      channel,
      tag: "beta",
      env: {
        FLEXTAB_EXT_NAME: BETA_NAME,
        // Plasmo's manifest check allows at most three parts, so Plasmo builds
        // X.Y.Z and build.mjs writes the four-part version afterwards.
        FLEXTAB_EXT_VERSION: base,
        FLEXTAB_EXT_VERSION_NAME: versionName,
        FLEXTAB_GECKO_ID: GECKO_IDS.beta,
        // Inlined into the bundle: the channel the extension reports to the server (TASK-114).
        PLASMO_PUBLIC_FLEXTAB_CHANNEL: "beta",
      },
      version,
    }
  }
  throw new Error(`Unknown release channel "${channel}".`)
}

const STABLE_TAG = /^v(\d+)\.(\d+)\.(\d+)$/

const compareParts = (a, b) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

/** The highest vX.Y.Z among `tags`, or undefined when there is none. */
export function latestStableTag(tags) {
  return tags
    .filter((t) => STABLE_TAG.test(t))
    .sort((a, b) => compareParts(STABLE_TAG.exec(b).slice(1).map(Number), STABLE_TAG.exec(a).slice(1).map(Number)))[0]
}

/**
 * The next beta tag: beta-v<last stable>.<commits since it>. It must be above every
 * beta tag already made, so a tester's browser always sees a higher version.
 */
export function nextBetaTag({ stableTag, commitsSince, betaTags }) {
  if (!stableTag) {
    throw new Error("No stable tag (vX.Y.Z) in this branch's history. Tag the last stable release first; a beta version counts from it.")
  }
  if (!(commitsSince >= 1)) {
    throw new Error(`No commits since ${stableTag}, so there is nothing new to ship as a beta.`)
  }
  const tag = `beta-${stableTag}.${commitsSince}`
  const { version } = parseBetaTag(tag)
  const parts = version.split(".").map(Number)
  const highest = betaTags
    .filter((t) => BETA_TAG.test(t))
    .map((t) => ({ t, parts: BETA_TAG.exec(t).slice(1).map(Number) }))
    .sort((a, b) => compareParts(b.parts, a.parts))[0]
  if (highest && compareParts(parts, highest.parts) <= 0) {
    throw new Error(`${tag} is not above the last beta tag ${highest.t}. A beta version has to go up.`)
  }
  return tag
}

/** The built manifest with the plan's final version, or unchanged when the plan has none. */
export function finalizeManifest(manifest, plan) {
  return plan.version ? { ...manifest, version: plan.version } : manifest
}
