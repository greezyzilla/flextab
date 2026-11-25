#!/usr/bin/env node
/**
 * Firefox smoke test: drives the installed Firefox through WebDriver
 * BiDi, with no dependency, and checks what the unit tests cannot: the build
 * really runs in Firefox. Local and before a release only (it needs Firefox).
 *
 *   PLASMO_PUBLIC_API_URL=https://api.example.invalid PLASMO_PUBLIC_API_HOST='https://api.example.invalid/*' \
 *     npm run build -- --channel=stable --target=firefox-mv3
 *   node scripts/firefox-smoke.mjs [build/firefox-mv3-prod] [--firefox=/path/to/firefox]
 *
 * Use a build pointed at the unroutable example host: the test signs in with a
 * fake token, which a real server would answer with 401 and sign out.
 *
 * Checks: the new tab page and the popup render; both shortcuts are registered;
 * the tab grouping API is there; revoking the API host permission turns sync to
 * "Sync off"; an update applied while FlexTab pages are open brings them back on
 * the new version (Firefox closes every extension tab on reload).
 */
import { spawn } from "node:child_process"
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const source = resolve(process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "build/firefox-mv3-prod")
const firefoxBin = arg("firefox") ?? "/Applications/Firefox.app/Contents/MacOS/firefox"
const UUID = "0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const work = mkdtempSync(join(tmpdir(), "flextab-ff-"))
const ext = join(work, "ext")
const profile = join(work, "profile")
cpSync(source, ext, { recursive: true })
const manifest = JSON.parse(readFileSync(join(ext, "manifest.json"), "utf8"))
const id = manifest.browser_specific_settings?.gecko?.id
await import("node:fs").then((fs) => fs.mkdirSync(profile, { recursive: true }))
writeFileSync(join(profile, "user.js"), [
  `user_pref("extensions.webextensions.uuids", ${JSON.stringify(JSON.stringify({ [id]: UUID }))});`,
  `user_pref("browser.aboutwelcome.enabled", false);`,
  `user_pref("browser.shell.checkDefaultBrowser", false);`,
].join("\n"))

// --- a minimal WebDriver BiDi client (Node's global WebSocket) ---
const port = 9300 + Math.floor(Math.random() * 600)
const ff = spawn(firefoxBin, ["--headless", "--profile", profile, `--remote-debugging-port=${port}`, "--no-remote"], {
  stdio: ["ignore", "pipe", "pipe"],
  // Lets the test open moz-extension:// pages from the browser window, which plain BiDi refuses.
  env: { ...process.env, MOZ_REMOTE_ALLOW_SYSTEM_ACCESS: "1" },
})
await new Promise((ok, fail) => {
  const timer = setTimeout(() => fail(new Error("Firefox did not start")), 30000)
  // Firefox 160 prints this line on stdout; earlier versions printed it on stderr.
  const ready = (d) => { if (String(d).includes("WebDriver BiDi listening")) { clearTimeout(timer); ok() } }
  ff.stdout.on("data", ready)
  ff.stderr.on("data", ready)
})
const ws = new WebSocket(`ws://127.0.0.1:${port}/session`)
await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail })
let next = 0
const pending = new Map()
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data)
  const p = msg.id && pending.get(msg.id)
  if (!p) return
  pending.delete(msg.id)
  if (msg.type === "error") p.fail(new Error(`${msg.error}: ${msg.message}`))
  else p.ok(msg.result)
}
const send = (method, params = {}) => new Promise((ok, fail) => {
  const i = ++next
  const timer = setTimeout(() => { pending.delete(i); fail(new Error(`${method} timed out`)) }, 15000)
  pending.set(i, { ok: (v) => { clearTimeout(timer); ok(v) }, fail: (e) => { clearTimeout(timer); fail(e) } })
  ws.send(JSON.stringify({ id: i, method, params }))
})

const results = []
const check = (name, pass, detail = "") => { results.push(pass); console.log(`${pass ? "✓" : "✖"} ${name}${detail ? `: ${detail}` : ""}`) }

async function windowEval(expression) {
  const { contexts } = await send("browsingContext.getTree", { "moz:scope": "chrome" })
  return send("script.evaluate", { target: { context: contexts[0].context }, awaitPromise: true, expression })
}
async function pages() {
  return (await send("browsingContext.getTree", {})).contexts
}
async function pageEval(url, expression) {
  const page = (await pages()).find((c) => c.url.startsWith(url))
  if (!page) throw new Error(`no page at ${url}`)
  const r = await send("script.evaluate", { target: { context: page.context }, awaitPromise: true, expression })
  if (r.type === "exception") throw new Error(r.exceptionDetails.text)
  // BiDi sends null and undefined as a type with no value.
  return r.result.type === "null" ? null : r.result.value
}
const extUrl = (path) => `moz-extension://${UUID}/${path}`
const openTab = (path, select = true) => windowEval(`(() => { const t = gBrowser.addTab(${JSON.stringify(extUrl(path))}, { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() }); if (${select}) gBrowser.selectedTab = t; return 1 })()`)
// Polled from here: Firefox slows timers in background tabs, so a loop inside the page can stall.
async function textOf(url, re, tries = 30) {
  for (let i = 0; i < tries; i++) {
    const text = await pageEval(url, `[...document.querySelectorAll("body *")].find((e) => e.children.length === 0 && ${re}.test(e.textContent))?.textContent ?? null`)
    if (text !== null && text !== undefined) return text
    await sleep(200)
  }
  return null
}

try {
  await send("session.new", { capabilities: { alwaysMatch: {} } })
  await send("webExtension.install", { extensionData: { type: "path", path: ext } })
  await sleep(1500)

  await openTab("newtab.html")
  await sleep(2500)
  const footer = await textOf(extUrl("newtab.html"), "/^FlexTab v/")
  check("new tab page renders", footer === `FlexTab v${manifest.version_name ?? manifest.version}`, footer ?? "no footer")

  const commands = await pageEval(extUrl("newtab.html"), `browser.commands.getAll().then((cs) => cs.map((c) => c.name).sort().join(","))`)
  check("keyboard shortcuts are registered", commands.includes("save-page") && commands.includes("save-window"), commands)

  const grouping = await pageEval(extUrl("newtab.html"), `typeof browser.tabs.group`)
  check("tab grouping API is present (Firefox 139+)", grouping === "function", grouping)

  await openTab("popup.html")
  await sleep(1500)
  const popupText = await pageEval(extUrl("popup.html"), `document.body.innerText.trim().length`)
  check("popup renders", popupText > 0, `${popupText} characters`)

  // Signed in (a fake token: the example host never answers) with the data
  // consent sign-in asks for, so the only thing missing later is the host.
  const host = manifest.host_permissions[0]
  const dataCollection = manifest.browser_specific_settings.gecko.data_collection_permissions.optional
  const grant = (perms) => windowEval(`(async () => { const { ExtensionPermissions } = ChromeUtils.importESModule("resource://gre/modules/ExtensionPermissions.sys.mjs"); const policy = WebExtensionPolicy.getByID(${JSON.stringify(id)}); await ExtensionPermissions.add(${JSON.stringify(id)}, ${JSON.stringify(perms)}, policy.extension); return 1 })()`)
  await grant({ permissions: [], origins: [], data_collection: dataCollection })
  await pageEval(extUrl("newtab.html"), `browser.storage.local.set({ auth_tokens: { access_token: "smoke", refresh_token: "smoke", expires_at: 4102444800 } })`)
  await openTab("newtab.html")
  await sleep(2500)
  const consent = await pageEval(extUrl("newtab.html"), `browser.permissions.contains({ origins: [${JSON.stringify(host)}], data_collection: ${JSON.stringify(dataCollection)} })`)
  check("with host access and data consent, sync is allowed", consent === true && (await textOf(extUrl("newtab.html"), "/^Sync off$/")) === null, `contains=${consent}`)
  await pageEval(extUrl("newtab.html"), `browser.permissions.remove({ origins: [${JSON.stringify(host)}] })`)
  const off = await textOf(extUrl("newtab.html"), "/^Sync off$/")
  check("a revoked host permission shows Sync off", off === "Sync off", off ?? "not shown")
  await grant({ permissions: [], origins: [host] })
  let back = false
  for (let i = 0; i < 30 && !back; i++) { back = (await textOf(extUrl("newtab.html"), "/^Sync off$/", 1)) === null; if (!back) await sleep(200) }
  check("allowing access again clears Sync off", back === true)

  // An update while FlexTab pages are open: a newer version on disk,
  // the browser's update notice (the ready flag), then the user switches away.
  manifest.version = manifest.version.split(".").map((n, i, all) => (i === all.length - 1 ? String(Number(n) + 1) : n)).join(".")
  if (manifest.version_name) manifest.version_name = `${manifest.version_name} (smoke update)`
  writeFileSync(join(ext, "manifest.json"), JSON.stringify(manifest))
  const before = (await pages()).filter((c) => c.url.startsWith(`moz-extension://${UUID}/`)).length
  await pageEval(extUrl("newtab.html"), `browser.storage.local.set({ flextab_update_ready: { version: "smoke", at: Date.now() } })`)
  await windowEval(`(() => { gBrowser.selectedTab = gBrowser.addTab("about:blank", { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() }); return 1 })()`)
  // The pages finish their writes (up to 5s), the extension reloads, then restores the tabs.
  let after = []
  for (let i = 0; i < 50 && after.length < before; i++) {
    await sleep(500)
    after = (await pages()).filter((c) => c.url.startsWith(`moz-extension://${UUID}/`))
  }
  await sleep(1500)
  const updatedFooter = after.length ? await textOf(after[0].url, "/^FlexTab v/") : null
  check("an update brings every FlexTab page back", after.length === before, `${before} before, ${after.length} after`)
  check("the pages run the new version", updatedFooter === `FlexTab v${manifest.version_name ?? manifest.version}`, updatedFooter ?? "no footer")
} catch (err) {
  check("smoke run", false, err.message)
} finally {
  try { await send("session.end") } catch { /* closing anyway */ }
  ws.close()
  ff.kill()
  await sleep(500)
  rmSync(work, { recursive: true, force: true })
}

const failed = results.filter((r) => !r).length
console.log(failed ? `\n${failed} check(s) failed.` : "\nAll Firefox checks passed.")
process.exit(failed ? 1 : 0)
