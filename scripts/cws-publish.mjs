#!/usr/bin/env node
/**
 * Uploads a zip to an existing Chrome Web Store item and submits it for review.
 * It submits a STAGED publish by default: after approval it waits for the
 * developer to press Publish in the dashboard, so a release never goes live
 * before the backend it needs is deployed. --publish=default goes live as soon
 * as it is approved. Chrome Web Store API v2, no dependencies.
 *
 *   CWS_CLIENT_ID=… CWS_CLIENT_SECRET=… CWS_REFRESH_TOKEN=… CWS_PUBLISHER_ID=… CWS_ITEM_ID=… \
 *     node scripts/cws-publish.mjs build/chrome-mv3-prod.zip [--publish=staged|default]
 *
 * The API cannot create an item: its first version is uploaded once by hand in
 * the Developer Dashboard.
 */
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

export const REQUIRED_ENV = ["CWS_CLIENT_ID", "CWS_CLIENT_SECRET", "CWS_REFRESH_TOKEN", "CWS_PUBLISHER_ID", "CWS_ITEM_ID"]
const API = "https://chromewebstore.googleapis.com"

export function missingEnv(env) {
  return REQUIRED_ENV.filter((k) => !env[k])
}

async function json(res, what) {
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${what} failed (${res.status}): ${JSON.stringify(body)}`)
  return body
}

export const PUBLISH_TYPES = { staged: "STAGED_PUBLISH", default: "DEFAULT_PUBLISH" }

/** Upload, then submit for review (staged unless told otherwise). Returns the publish response. */
export async function publishStaged({ zip, env, publishType = PUBLISH_TYPES.staged, fetch: request = fetch, log = () => {} }) {
  const token = await json(await request("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.CWS_CLIENT_ID,
      client_secret: env.CWS_CLIENT_SECRET,
      refresh_token: env.CWS_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  }), "Getting an access token")
  const auth = { Authorization: `Bearer ${token.access_token}` }
  const item = `publishers/${env.CWS_PUBLISHER_ID}/items/${env.CWS_ITEM_ID}`

  const upload = await json(await request(`${API}/upload/v2/${item}:upload?uploadType=media`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/zip" },
    body: zip,
  }), "Uploading the zip")
  log(`Upload: ${upload.uploadState ?? "unknown state"}`)
  if (upload.uploadState === "FAILED") throw new Error(`The Web Store rejected the upload: ${JSON.stringify(upload)}`)

  const published = await json(await request(`${API}/v2/${item}:publish`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ publishType }),
  }), "Submitting for review")
  log(`Submitted for review (${publishType}): ${published.state ?? JSON.stringify(published)}`)
  return published
}

async function main() {
  const path = process.argv.slice(2).find((a) => !a.startsWith("--"))
  const mode = process.argv.find((a) => a.startsWith("--publish="))?.slice("--publish=".length) ?? "staged"
  if (!PUBLISH_TYPES[mode]) {
    console.error(`--publish must be staged or default, not "${mode}".`)
    process.exit(2)
  }
  if (!path) {
    console.error("Pass the zip to upload, e.g. build/chrome-mv3-prod.zip.")
    process.exit(2)
  }
  const missing = missingEnv(process.env)
  if (missing.length) {
    console.error(`Missing ${missing.join(", ")}.`)
    process.exit(2)
  }
  try {
    await publishStaged({ zip: readFileSync(path), env: process.env, publishType: PUBLISH_TYPES[mode], log: console.log })
    console.log(mode === "staged"
      ? "After approval, press Publish in the Chrome Web Store dashboard once the backend it needs is live."
      : "It goes live for the item's testers as soon as it is approved.")
  } catch (err) {
    console.error(`✖ ${err.message}`)
    process.exit(1)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
