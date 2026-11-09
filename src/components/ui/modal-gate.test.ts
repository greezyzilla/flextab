// Gate for the modal standard (docs/modal-standard.md §9): every modal renders through
// ui/modal, so no component outside ui/ may build one from the raw dialog primitives.
import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const SRC = join(__dirname, "..", "..")
// The narrow-screen navigation drawer is a side sheet, not a modal dialog; the standard does not cover it.
const ALLOWED = [join("components", "layout", "Drawer.tsx")]

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return files(p)
    return /\.tsx?$/.test(name) && !/\.test\./.test(name) ? [p] : []
  })
}

describe("modal standard gate", () => {
  it("no component outside ui/ imports the raw dialog primitives", () => {
    const offenders = files(SRC)
      .filter((p) => !relative(SRC, p).startsWith(join("components", "ui")))
      .filter((p) => /from\s+["'](~src\/components\/ui\/(dialog|alert-dialog)|@radix-ui\/react-(dialog|alert-dialog))["']/.test(readFileSync(p, "utf8")))
      .map((p) => relative(SRC, p))
      .filter((p) => !ALLOWED.includes(p))
    expect(offenders).toEqual([])
  })
})
