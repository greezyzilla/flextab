import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import { GECKO_IDS, channelPlan, finalizeManifest, parseBetaTag, resolveChannel } from "./channel.mjs"

const pkg = JSON.parse(readFileSync(resolve(__dirname, "../package.json"), "utf8"))

/**
 * What Plasmo does with package.json `manifest` (0.90): a "$VAR" placeholder takes
 * the variable's value, an unset one is dropped, and the overrides land on top of
 * the manifest built from package.json name/version. Chrome builds drop
 * browser_specific_settings; a browser's `overrides` entry replaces keys for it.
 */
function builtManifest(plan, browser = "chrome") {
  const fill = (v) => {
    if (typeof v === "string") return v.startsWith("$") ? plan.env[v.slice(1)] : v
    if (Array.isArray(v)) return v.map(fill)
    if (v && typeof v === "object") {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x)]).filter(([, x]) => x !== undefined))
    }
    return v
  }
  const { optional_permissions, commands, host_permissions, overrides = {}, ...channelKeys } = pkg.manifest
  const manifest = { name: pkg.displayName, version: pkg.version, ...fill(channelKeys), ...(overrides[browser] ?? {}) }
  if (browser === "chrome") delete manifest.browser_specific_settings
  return finalizeManifest(manifest, plan)
}

describe("resolveChannel", () => {
  it("fails when no channel is set", () => {
    expect(() => resolveChannel([], {})).toThrow(/No release channel set/)
  })

  it("fails on an unknown channel", () => {
    expect(() => resolveChannel(["--channel=nightly"], {})).toThrow(/Unknown release channel "nightly"/)
  })

  it("reads --channel, then FLEXTAB_CHANNEL", () => {
    expect(resolveChannel(["--zip", "--channel=beta"], { FLEXTAB_CHANNEL: "stable" })).toBe("beta")
    expect(resolveChannel([], { FLEXTAB_CHANNEL: "stable" })).toBe("stable")
  })
})

describe("parseBetaTag", () => {
  it("turns beta-vX.Y.Z.N into the manifest version and the version people see", () => {
    expect(parseBetaTag("beta-v0.1.0.7")).toEqual({ version: "0.1.0.7", base: "0.1.0", versionName: "0.1.0 Beta 7" })
  })

  it.each([
    [undefined],
    ["v0.1.0"],
    ["beta-v0.1.0"],
    ["beta-v0.1.0.7-rc"],
    ["0.1.0.7"],
    ["beta-v0.1.0.0"],
    ["beta-v0.1.0.65536"],
    ["beta-v0.01.0.7"],
  ])("rejects %s", (tag) => {
    expect(() => parseBetaTag(tag)).toThrow()
  })
})

describe("the stable build", () => {
  const plan = channelPlan("stable")

  it("is today's build: package.json name and version, no version name, the prod tag", () => {
    expect(plan.tag).toBe("prod")
    const m = builtManifest(plan)
    expect(m.name).toBe(pkg.displayName)
    expect(m.version).toBe(pkg.version)
    expect(m).not.toHaveProperty("version_name")
    expect(m).not.toHaveProperty("browser_specific_settings")
  })

  it("carries the stable Firefox add-on id", () => {
    expect(builtManifest(plan, "firefox").browser_specific_settings.gecko).toMatchObject({ id: GECKO_IDS.stable })
  })
})

describe("the beta build", () => {
  const plan = channelPlan("beta", { betaTag: "beta-v0.1.0.7" })

  it("is FlexTab Beta with the four-part version and its version name", () => {
    expect(plan.tag).toBe("beta")
    const m = builtManifest(plan)
    expect(m.name).toBe("FlexTab Beta")
    expect(m.version).toBe("0.1.0.7")
    expect(m.version_name).toBe("0.1.0 Beta 7")
  })

  it("has its own Firefox add-on id, so it installs next to stable", () => {
    expect(builtManifest(plan, "firefox").browser_specific_settings.gecko).toMatchObject({ id: GECKO_IDS.beta })
    expect(GECKO_IDS.beta).not.toBe(GECKO_IDS.stable)
  })

  it("builds with a three-part version, which is all Plasmo's manifest check accepts", () => {
    expect(plan.env.FLEXTAB_EXT_VERSION).toBe("0.1.0")
  })

  it("fails without a valid beta tag", () => {
    expect(() => channelPlan("beta", {})).toThrow(/beta-vX\.Y\.Z\.N/)
  })
})

describe("package.json manifest placeholders", () => {
  it("has a placeholder for every value a channel sets", () => {
    const placeholders = JSON.stringify(pkg.manifest).match(/"\$FLEXTAB_\w+"/g).map((s) => s.slice(2, -1))
    const used = new Set([...Object.keys(channelPlan("stable").env), ...Object.keys(channelPlan("beta", { betaTag: "beta-v1.0.0.1" }).env)].filter((k) => k.startsWith("FLEXTAB_")))
    expect(new Set(placeholders)).toEqual(used)
  })
})

describe("the Firefox manifest (TASK-112)", () => {
  const firefox = builtManifest(channelPlan("stable"), "firefox")
  const chrome = builtManifest(channelPlan("stable"), "chrome")

  it("asks for Firefox 140 (ESR) and declares its data collection: none required, the account data optional", () => {
    expect(firefox.browser_specific_settings.gecko).toMatchObject({
      strict_min_version: "140.0",
      data_collection_permissions: {
        required: ["none"],
        optional: ["personallyIdentifyingInfo", "authenticationInfo", "bookmarksInfo", "technicalAndInteraction"],
      },
    })
  })

  it("drops the Chrome-only favicon permission for Firefox and keeps the rest", () => {
    expect(firefox.permissions).toEqual(pkg.manifest.permissions.filter((p) => p !== "favicon"))
    expect(chrome.permissions).toContain("favicon")
  })
})

describe("the channel the code reports (TASK-114)", () => {
  it("is stable or beta, inlined through a PLASMO_PUBLIC variable", () => {
    expect(channelPlan("stable").env.PLASMO_PUBLIC_FLEXTAB_CHANNEL).toBe("stable")
    expect(channelPlan("beta", { betaTag: "beta-v0.1.0.7" }).env.PLASMO_PUBLIC_FLEXTAB_CHANNEL).toBe("beta")
  })
})
