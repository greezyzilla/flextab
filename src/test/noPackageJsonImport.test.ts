// Importing package.json from app code makes the bundler inline the whole file
// (scripts, dependencies, overrides) into the page every user downloads.
// The version comes from chrome.runtime.getManifest() instead.
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, resolve } from "node:path"
import { describe, expect, it } from "vitest"

const SRC = resolve(__dirname, "..")
const IMPORT = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)["'][^"']*package\.json["']/

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx|js|jsx|mjs)$/.test(name) && !/\.test\.[jt]sx?$/.test(name) ? [path] : []
  })
}

describe("app code", () => {
  it("never imports package.json", () => {
    const offenders = sourceFiles(SRC).filter((f) => IMPORT.test(readFileSync(f, "utf8"))).map((f) => f.slice(SRC.length + 1))
    expect(offenders).toEqual([])
  })
})
