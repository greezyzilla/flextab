// Gate for docs/danger-standard.md (TASK-84 section 7): red reaches the UI only through the danger
// tokens (danger, danger-strong, destructive) and the primitives that use them, never as a raw palette
// class or a hard-coded red hex, so every red follows the theme (light/dark) and its contrast rules.
import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const SRC = join(__dirname, "..", "..")

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return name === "node_modules" ? [] : files(p)
    return /\.(tsx|ts)$/.test(name) && !/\.test\./.test(name) ? [p] : []
  })
}

/** Raw red/rose palette classes (text-red-400, hover:bg-rose-500/10, …). */
const RAW_CLASS = /\b(?:[a-z-]+:)*(?:text|bg|border|ring|outline|fill|stroke|from|via|to|decoration|shadow|divide)-(?:red|rose)-\d{2,3}\b/g
/** Hard-coded reds: Tailwind red/rose 300-900 hexes and a few common pure reds. */
const RAW_HEX = /#(?:fca5a5|f87171|ef4444|dc2626|b91c1c|991b1b|7f1d1d|fda4af|fb7185|f43f5e|e11d48|be123c|ff0000|f00)\b/gi
/**
 * Files allowed a literal red hex, each for a reason the tokens cannot cover:
 * - a colour a user picks for their own content (a space's colour, in lib/data-colours.ts) is data, not a danger signal;
 * - the browser toolbar icon's badge is drawn on a canvas outside any page, where CSS tokens don't exist.
 */
const USER_COLOURS = new Set(["lib/data-colours.ts", "services/toolbarMarks.ts"])

describe("danger standard gate", () => {
  it("uses no raw red palette class or red hex outside the danger tokens", () => {
    const offenders = files(SRC).flatMap((f) => {
      const rel = relative(SRC, f)
      const src = readFileSync(f, "utf8")
      const hits = [...src.matchAll(RAW_CLASS)].map((m) => `${rel}: ${m[0]}`)
      if (!USER_COLOURS.has(rel)) hits.push(...[...src.matchAll(RAW_HEX)].map((m) => `${rel}: ${m[0]}`))
      return hits
    })
    expect(offenders).toEqual([])
  })

  it("has no !text-danger override (a danger look comes from its primitive, not a forced class)", () => {
    const offenders = files(SRC).filter((f) => readFileSync(f, "utf8").includes("!text-danger")).map((f) => relative(SRC, f))
    expect(offenders).toEqual([])
  })
})
