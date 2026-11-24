// Gate for TASK-53: an icon-only button names itself with aria-label and explains itself with the
// app Tooltip (IconButton's `tooltip` prop or a wrapping <Tooltip>), never with a native `title`,
// whose look, size and delay differ from the tooltip on the button next to it.
import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const SRC = join(__dirname, "..", "..")

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return files(p)
    return /\.tsx$/.test(name) && !/\.test\./.test(name) ? [p] : []
  })
}

/** Every `<IconButton …>` opening tag in `code`, braces and strings skipped so `=>` doesn't end it. */
export function iconButtonTags(code: string): string[] {
  const tags: string[] = []
  let from = 0
  for (;;) {
    const start = code.indexOf("<IconButton", from)
    if (start < 0) return tags
    let depth = 0, quote = "", i = start + 1
    for (; i < code.length; i++) {
      const c = code[i]
      if (quote) { if (c === quote && code[i - 1] !== "\\") quote = ""; continue }
      if (c === '"' || c === "'" || c === "`") quote = c
      else if (c === "{") depth++
      else if (c === "}") depth--
      else if (c === ">" && depth === 0) break
    }
    tags.push(code.slice(start, i + 1))
    from = i + 1
  }
}

const tags = files(SRC).flatMap((p) => iconButtonTags(readFileSync(p, "utf8")).map((tag) => ({ file: relative(SRC, p), tag })))

describe("icon button gate", () => {
  it("finds the icon buttons it guards", () => {
    expect(tags.length).toBeGreaterThan(5)
  })

  it("no icon button uses a native title tooltip", () => {
    expect(tags.filter(({ tag }) => /\stitle=/.test(tag)).map(({ file }) => file)).toEqual([])
  })

  it("every icon button has an aria-label", () => {
    expect(tags.filter(({ tag }) => !/\saria-label=/.test(tag)).map(({ file }) => file)).toEqual([])
  })

  it("the tag scanner ignores > inside expressions and strings", () => {
    expect(iconButtonTags(`<IconButton onClick={() => a > b} aria-label="x > y">kid</IconButton>`))
      .toEqual([`<IconButton onClick={() => a > b} aria-label="x > y">`])
  })
})
