import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import { GECKO_ID, channelPlan, resolveChannel } from "./channel.mjs"

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
  return manifest
}

describe("resolveChannel", () => {
  it("fails when no channel is set", () => {
    expect(() => resolveChannel([], {})).toThrow(/No release channel set/)
  })

  it("fails on an unknown channel", () => {
    expect(() => resolveChannel(["--channel=nightly"], {})).toThrow(/Unknown release channel "nightly"/)
  })

  it("reads --channel, then FLEXTAB_CHANNEL", () => {
    expect(resolveChannel(["--zip", "--channel=stable"], { FLEXTAB_CHANNEL: "nightly" })).toBe("stable")
    expect(resolveChannel([], { FLEXTAB_CHANNEL: "stable" })).toBe("stable")
  })

  it("has no beta channel", () => {
    expect(() => resolveChannel(["--channel=beta"], {})).toThrow(/Unknown release channel "beta"/)
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
    expect(builtManifest(plan, "firefox").browser_specific_settings.gecko).toMatchObject({ id: GECKO_ID })
  })
})

describe("package.json manifest placeholders", () => {
  it("has a placeholder for every value the channel sets, plus the dev build's name", () => {
    const placeholders = JSON.stringify(pkg.manifest).match(/"\$FLEXTAB_\w+"/g).map((s) => s.slice(2, -1))
    const used = new Set(Object.keys(channelPlan("stable").env).filter((k) => k.startsWith("FLEXTAB_")))
    // FLEXTAB_EXT_NAME comes from .env.development ("FlexTab Dev"); stable leaves it unset.
    expect(new Set(placeholders)).toEqual(new Set([...used, "FLEXTAB_EXT_NAME"]))
    expect(channelPlan("stable").env).not.toHaveProperty("FLEXTAB_EXT_NAME")
  })
})

describe("the Firefox manifest", () => {
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

describe("the channel the code reports", () => {
  it("is stable, inlined through a PLASMO_PUBLIC variable", () => {
    expect(channelPlan("stable").env.PLASMO_PUBLIC_FLEXTAB_CHANNEL).toBe("stable")
  })
})
