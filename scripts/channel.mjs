/**
 * The build channels:
 *   stable  the one public item, "FlexTab", against api.flextabmanager.com;
 *           name and version from package.json, build/<target>-prod.
 *   dev     "FlexTab Dev" against api-dev.flextabmanager.com (the BE dev branch,
 *           iPaymu sandbox), build/<target>-dev. For testing, never published.
 * `npm run dev` is neither: it is the local build (scripts/dev.mjs).
 *
 * Plasmo reads the channel through the `$FLEXTAB_*` placeholders in package.json
 * `manifest`; stable sets the Firefox add-on id. An unset placeholder is dropped:
 * `$FLEXTAB_EXT_NAME` is set by dev and by `npm run dev`, so stable keeps
 * package.json's name. The shell's variables win over env files, so the dev
 * channel's API values beat .env.production.
 *
 * Pure functions only, so the tests can cover the plan without a build.
 */

export const CHANNELS = ["stable", "dev"]

/** The dev channel's API: the BE `dev` branch (Dokploy "Backend (dev)"). */
export const DEV_API_URL = "https://api-dev.flextabmanager.com"

/** The host the content scripts are written for (src/contents: Plasmo keeps `matches` static). */
export const PROD_API_MATCH = "https://api.flextabmanager.com/*"

/**
 * The built manifest for `channel`: content scripts written for the production
 * API host match the channel's API host instead. Plasmo does not inline env
 * values into a content script's `matches`, so without this the dev build's
 * sign-in fallback (src/contents/auth-capture.ts) would never run on its API.
 */
export function patchManifest(manifest, channel) {
  const host = channelPlan(channel).env.PLASMO_PUBLIC_API_HOST
  if (!host || host === PROD_API_MATCH) return manifest
  return {
    ...manifest,
    content_scripts: (manifest.content_scripts ?? []).map((cs) => ({
      ...cs,
      matches: (cs.matches ?? []).map((m) => (m === PROD_API_MATCH ? host : m)),
    })),
  }
}

/** Firefox add-on id. Permanent once uploaded to AMO: never change it after that. */
export const GECKO_ID = "flextab@flextabmanager.com"

/**
 * The channel from `--channel=<name>` or FLEXTAB_CHANNEL. A build with no channel
 * fails instead of guessing which item it is.
 */
export function resolveChannel(argv, env) {
  const arg = argv.find((a) => a.startsWith("--channel="))
  const channel = arg ? arg.slice("--channel=".length) : env.FLEXTAB_CHANNEL
  if (!channel) {
    throw new Error(`No release channel set. Pass --channel=stable (or set FLEXTAB_CHANNEL).`)
  }
  if (!CHANNELS.includes(channel)) {
    throw new Error(`Unknown release channel "${channel}". Use one of: ${CHANNELS.join(", ")}.`)
  }
  return channel
}

/**
 * Everything a build of `channel` needs:
 *   tag  Plasmo's --tag: picks build/<target>-<tag>
 *   env  the FLEXTAB_* values the package.json manifest placeholders read, and
 *        PLASMO_PUBLIC_FLEXTAB_CHANNEL, which the code sends as X-Client-Channel
 */
export function channelPlan(channel) {
  if (channel === "stable") {
    return { channel, tag: "prod", env: { FLEXTAB_GECKO_ID: GECKO_ID, PLASMO_PUBLIC_FLEXTAB_CHANNEL: "stable" } }
  }
  if (channel === "dev") {
    return {
      channel,
      tag: "dev",
      env: {
        FLEXTAB_EXT_NAME: "FlexTab Dev",
        PLASMO_PUBLIC_FLEXTAB_CHANNEL: "dev",
        PLASMO_PUBLIC_API_URL: DEV_API_URL,
        PLASMO_PUBLIC_API_HOST: `${DEV_API_URL}/*`,
      },
    }
  }
  throw new Error(`Unknown release channel "${channel}".`)
}
