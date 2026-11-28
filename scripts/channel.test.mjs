import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import { CHANNELS, DEV_API_URL, GECKO_ID, PROD_API_MATCH, channelPlan, patchManifest, resolveChannel } from "./channel.mjs"

const pkg = JSON.parse(readFileSync(resolve(__dirname, "../package.json"), "utf8"))

/**
 * What Plasmo does with package.json `manifest` (0.90): a "$VAR" placeholder takes
 * the variable's value, an unset one is dropped, and the overrides land on top of
 * the manifest built from package.json name/version. Chrome builds drop
 * browser_specific_settings and Firefox builds keep only its `gecko` key; a browser's
 * `overrides` entry then replaces whole top-level keys for it.
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
  const manifest = { name: pkg.displayName, version: pkg.version, ...fill(channelKeys) }
  if (manifest.browser_specific_settings) {
    if (browser === "firefox") manifest.browser_specific_settings = { gecko: manifest.browser_specific_settings.gecko }
    else delete manifest.browser_specific_settings
  }
  return { ...manifest, ...fill(overrides[browser] ?? {}) }
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
  it("has a placeholder for every value a channel sets", () => {
    const placeholders = JSON.stringify(pkg.manifest).match(/"\$FLEXTAB_\w+"/g).map((s) => s.slice(2, -1))
    const used = new Set(CHANNELS.flatMap((c) => Object.keys(channelPlan(c).env)).filter((k) => k.startsWith("FLEXTAB_")))
    expect(new Set(placeholders)).toEqual(used)
    // Stable keeps package.json's name.
    expect(channelPlan("stable").env).not.toHaveProperty("FLEXTAB_EXT_NAME")
  })
})

describe("the dev build", () => {
  const plan = channelPlan("dev")

  it("is FlexTab Dev in build/<target>-dev, against the dev API", () => {
    expect(resolveChannel(["--channel=dev"], {})).toBe("dev")
    expect(plan.tag).toBe("dev")
    expect(builtManifest(plan).name).toBe("FlexTab Dev")
    expect(DEV_API_URL).toBe("https://api-dev.flextabmanager.com")
    expect(plan.env.PLASMO_PUBLIC_API_URL).toBe(DEV_API_URL)
    expect(plan.env.PLASMO_PUBLIC_API_HOST).toBe(`${DEV_API_URL}/*`)
    expect(plan.env.PLASMO_PUBLIC_FLEXTAB_CHANNEL).toBe("dev")
  })

  it("runs its content scripts on the dev API host, and stable keeps the production host", () => {
    const built = { name: "x", content_scripts: [{ matches: [PROD_API_MATCH], js: ["a.js"] }, { matches: ["https://other.example/*"], js: ["b.js"] }] }
    expect(patchManifest(built, "dev").content_scripts).toEqual([
      { matches: [`${DEV_API_URL}/*`], js: ["a.js"] },
      { matches: ["https://other.example/*"], js: ["b.js"] },
    ])
    expect(patchManifest(built, "stable")).toEqual(built)
    // The content script the patch exists for is still written for the production host.
    expect(readFileSync(resolve(__dirname, "../src/contents/auth-capture.ts"), "utf8")).toContain(`matches: ["${PROD_API_MATCH}"]`)
  })

  it("never carries the store's Firefox add-on id", () => {
    expect(builtManifest(plan, "firefox").browser_specific_settings?.gecko?.id).toBeUndefined()
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

  it("asks for Firefox for Android 142, the first that reads data_collection_permissions", () => {
    expect(firefox.browser_specific_settings.gecko_android).toEqual({ strict_min_version: "142.0" })
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
