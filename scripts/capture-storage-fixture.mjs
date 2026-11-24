#!/usr/bin/env node
/**
 * Captures what a released version leaves in browser storage, as a fixture for
 * src/test/storageFixtures.test.ts (TASK-113). Run once per release, from the
 * release's own build, so every later version is tested against it:
 *
 *   npm run build:zip -- --channel=stable
 *   node scripts/capture-storage-fixture.mjs --build=build/chrome-mv3-prod --version=0.1.0
 *
 * It loads the build in Chromium, fills the workspace through the app itself
 * (a OneTab import on Settings > Backup), changes a setting through its control,
 * and dumps chrome.storage.local and .sync. Signing in needs the live backend, so
 * the auth_tokens entry is written directly, in the shape api.ts stores it.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

import { chromium } from "playwright"

const flag = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const build = resolve(flag("build") ?? "build/chrome-mv3-prod")
const version = flag("version")
if (!version) {
  console.error("Pass --version=X.Y.Z (the released version this build is).")
  process.exit(1)
}

// Content worst cases: unicode, emoji, a long title, the same URL twice, a URL with a hash.
const ONETAB = [
  "https://example.com/research | Research notes",
  "https://例え.jp/パス | 日本語のタイトル",
  "https://example.org/a#section | Emoji 🎉 title with a fragment",
  "",
  `https://example.net/long | ${"A very long title that keeps going ".repeat(6).trim()}`,
  "https://example.com/research | Research notes",
].join("\n")
const TITLES = ["Research notes", "日本語のタイトル", "Emoji 🎉 title with a fragment"]
const AUTH = { access_token: "fixture-access", refresh_token: "fixture-refresh", expires_at: 4102444800 }

const profile = mkdtempSync(join(tmpdir(), "flextab-fixture-"))
const ctx = await chromium.launchPersistentContext(profile, {
  channel: "chromium",
  headless: true,
  args: [`--disable-extensions-except=${build}`, `--load-extension=${build}`],
})
try {
  let [sw] = ctx.serviceWorkers()
  if (!sw) sw = await ctx.waitForEvent("serviceworker")
  const id = sw.url().split("/")[2]
  const page = await ctx.newPage()

  await page.goto(`chrome-extension://${id}/newtab.html#/settings/backup`)
  await page.locator('input[type="file"]').setInputFiles({ name: "onetab.txt", mimeType: "text/plain", buffer: Buffer.from(ONETAB) })
  await page.getByRole("button", { name: /^Add \d+ tabs?$/ }).click()
  await page.getByText(/Imported|Added/).first().waitFor({ timeout: 10000 }).catch(() => {})

  await page.goto(`chrome-extension://${id}/newtab.html#/settings/layout`)
  await page.getByRole("radio", { name: "Compact" }).click()
  await page.waitForTimeout(1500) // local writes land

  await sw.evaluate((auth) => chrome.storage.local.set({ auth_tokens: auth }), AUTH)
  const storage = await sw.evaluate(async () => ({
    local: await chrome.storage.local.get(null),
    sync: await chrome.storage.sync.get(null),
  }))

  const out = resolve("src/test/fixtures/storage", `v${version}.json`)
  mkdirSync(resolve("src/test/fixtures/storage"), { recursive: true })
  writeFileSync(out, JSON.stringify({
    version,
    capturedAt: new Date().toISOString().slice(0, 10),
    expected: { titles: TITLES, density: "compact", auth: AUTH },
    ...storage,
  }, null, 2) + "\n")
  console.log(`Wrote ${out} (${Object.keys(storage.local).length} local keys, ${Object.keys(storage.sync).length} sync keys)`)
} finally {
  await ctx.close()
  rmSync(profile, { recursive: true, force: true })
}
