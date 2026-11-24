import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it } from "vitest"
import { APPEARANCE_STORAGE_KEY, THEME_STORAGE_KEY, applyStoredLook } from "~src/lib/theme"
import { BOOT_SKELETON_ID, PopupSkeleton } from "~src/components/PopupSkeleton"

const page = (name: string) => readFileSync(resolve(__dirname, `../${name}/index.html`), "utf8")

describe("page templates", () => {
  it.each(["popup", "newtab"])("%s loads the boot script in <head>, as a file, before the body", (name) => {
    const html = page(name)
    const head = html.slice(0, html.indexOf("</head>"))
    expect(head).toMatch(/<script src="\.\.\/src\/boot\/look\.js"><\/script>/)
    expect(head).not.toMatch(/<script>(?!<\/script>)/) // no inline script: MV3 pages refuse them
    expect(html).toContain("__plasmo_static_index_title__")
    // The page's own icon: the manifest blue, and what the accent icon falls back to.
    expect(head).toMatch(/<link rel="icon" type="image\/x-icon" href="\/assets\/favicon\.ico" \/>/)
    expect(html).toContain('<html lang="en">') // the a11y fix (baadad9) keeps its language
  })

  it("newtab.html fills its boot skeleton with a classic script right after it, before the app bundle", () => {
    const html = page("newtab")
    const body = html.slice(html.indexOf("<body>"))
    expect(body).toMatch(/<div id="boot-skeleton" aria-hidden="true"><\/div>\s*<script src="\.\.\/src\/boot\/shell\.js"><\/script>/)
  })

  it("popup.html holds PopupSkeleton's markup exactly, so the first frame matches what React draws", () => {
    const html = page("popup")
    const open = `<div id="${BOOT_SKELETON_ID}" aria-hidden="true">`
    const start = html.indexOf(open) + open.length
    const end = html.indexOf("</div>\n  </body>")
    expect(html.indexOf(open)).toBeGreaterThan(0)
    expect(html.slice(start, end)).toBe(renderToStaticMarkup(createElement(PopupSkeleton)))
  })
})

describe("boot/look.js", () => {
  const root = document.documentElement
  const boot = readFileSync(resolve(__dirname, "look.js"), "utf8")
  const reset = () => { root.removeAttribute("style"); root.removeAttribute("class") }
  const state = () => ({ style: root.getAttribute("style"), classes: [...root.classList].sort() })
  afterEach(() => { localStorage.clear(); reset() })

  const green = { hue: 145, intensity: 80, groupTint: 20, radius: 12, fontFamily: "serif", uiScale: 1.1, density: "compact", reduceMotion: true, appIcon: "blue" }
  it.each([
    ["nothing stored (first run)", {}],
    ["a full copy and Dark", { [APPEARANCE_STORAGE_KEY]: JSON.stringify(green), [THEME_STORAGE_KEY]: "dark" }],
    ["a copy from before the app icon choice and Light", { [APPEARANCE_STORAGE_KEY]: JSON.stringify({ ...green, appIcon: undefined }), [THEME_STORAGE_KEY]: "light" }],
    ["a broken copy", { [APPEARANCE_STORAGE_KEY]: "{oops", [THEME_STORAGE_KEY]: "sepia" }],
    ["a copy with an unknown font", { [APPEARANCE_STORAGE_KEY]: JSON.stringify({ ...green, fontFamily: "comic" }) }],
  ])("puts the same look on <html> as lib/theme applyStoredLook: %s", (_label, stored) => {
    for (const [k, v] of Object.entries(stored)) localStorage.setItem(k, v as string)
    applyStoredLook()
    const expected = state()
    reset()
    new Function(boot)()
    expect(state()).toEqual(expected)
  })
})
