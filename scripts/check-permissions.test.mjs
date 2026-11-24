import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import { API_HOST_TOKEN, LOCK_FILE, browserOf, compareRequired, lockOnlyCommits, requiredOf } from "./check-permissions.mjs"

const API = "https://api.example.invalid/*"
const chromeManifest = (over = {}) => ({
  permissions: ["tabs", "storage"],
  optional_permissions: ["tabGroups"],
  host_permissions: [API],
  content_scripts: [{ matches: ["https://api.flextabmanager.com/*"], js: ["a.js"] }],
  ...over,
})
const lock = { permissions: ["storage", "tabs"], host_permissions: [API_HOST_TOKEN], content_scripts: ["https://api.flextabmanager.com/*"] }

describe("required permissions", () => {
  it("reads what users must grant, with the API host from the build environment as a token", () => {
    expect(requiredOf(chromeManifest(), API)).toEqual(lock)
    expect(requiredOf(chromeManifest({ host_permissions: ["https://api.flextabmanager.com/*"] }), "https://api.flextabmanager.com/*").host_permissions).toEqual([API_HOST_TOKEN])
  })

  it("fails on an added permission, host or content script match, naming each", () => {
    const actual = requiredOf(chromeManifest({
      permissions: ["tabs", "storage", "bookmarks"],
      host_permissions: [API, "<all_urls>"],
      content_scripts: [{ matches: ["https://api.flextabmanager.com/*", "https://*/*"] }],
    }), API)
    expect(compareRequired(lock, actual).added).toEqual([
      { kind: "permissions", value: "bookmarks" },
      { kind: "host_permissions", value: "<all_urls>" },
      { kind: "content_scripts", value: "https://*/*" },
    ])
  })

  it("passes an added optional permission", () => {
    const actual = requiredOf(chromeManifest({ optional_permissions: ["tabGroups", "history"], optional_host_permissions: ["https://*/*"] }), API)
    expect(compareRequired(lock, actual)).toEqual({ added: [], removed: [] })
  })

  it("passes a removal and reports it, so the lock can drop it", () => {
    expect(compareRequired(lock, requiredOf(chromeManifest({ permissions: ["tabs"] }), API))).toEqual({
      added: [],
      removed: [{ kind: "permissions", value: "storage" }],
    })
  })

  it("checks Firefox's required data collection, not its optional data", () => {
    const firefox = chromeManifest({ browser_specific_settings: { gecko: { id: "x", data_collection_permissions: { required: ["none"], optional: ["bookmarksInfo"] } } } })
    expect(browserOf(firefox)).toBe("firefox")
    expect(browserOf(chromeManifest())).toBe("chrome")
    const locked = { ...lock, data_collection_required: ["none"] }
    expect(compareRequired(locked, requiredOf(firefox, API)).added).toEqual([])
    firefox.browser_specific_settings.gecko.data_collection_permissions.required = ["browsingActivity"]
    expect(compareRequired(locked, requiredOf(firefox, API)).added).toEqual([{ kind: "data_collection_required", value: "browsingActivity" }])
  })

  it("treats a browser missing from the lock as granting nothing yet", () => {
    expect(compareRequired(undefined, requiredOf(chromeManifest(), API)).added).toHaveLength(4)
  })

  it("lets the lock change only in a commit that changes the manifest", () => {
    expect(lockOnlyCommits([
      ["a", [LOCK_FILE, "package.json"]],
      ["b", [LOCK_FILE, "src/contents/auth-capture.ts"]],
      ["c", [LOCK_FILE, "README.md"]],
      ["d", ["package.json"]],
    ])).toEqual([["c", [LOCK_FILE, "README.md"]]])
  })

  it("records today's builds: both browsers, the API host as a token", () => {
    const recorded = JSON.parse(readFileSync(resolve(__dirname, "..", LOCK_FILE), "utf8"))
    expect(Object.keys(recorded).sort()).toEqual(["chrome", "firefox"])
    expect(recorded.chrome.host_permissions).toEqual([API_HOST_TOKEN])
    expect(recorded.firefox.permissions).not.toContain("favicon")
  })
})
