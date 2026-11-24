/**
 * The release channel: one public item, "FlexTab". Name and version come from
 * package.json, and the build lands in build/<target>-prod.
 *
 * Plasmo reads the channel through the `$FLEXTAB_*` placeholders in package.json
 * `manifest`; stable sets the Firefox add-on id. An unset placeholder is dropped:
 * `$FLEXTAB_EXT_NAME` is set only by .env.development, so `plasmo dev` builds
 * "FlexTab Dev" and stable keeps package.json's name.
 *
 * Pure functions only, so the tests can cover the plan without a build.
 */

export const CHANNELS = ["stable"]

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
  throw new Error(`Unknown release channel "${channel}".`)
}
