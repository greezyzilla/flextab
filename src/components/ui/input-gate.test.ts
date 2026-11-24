// Gate: every text field takes its look from ui/input.tsx (the field box: edge, fill,
// radius, height, focus), so call sites only place it (width, flex, alignment, font size of an
// inline label it replaces). A class that redraws the box at a call site is a one-off look.
import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const SRC = join(__dirname, "..", "..")

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return files(p)
    return /\.tsx$/.test(name) && !/\.test\./.test(name) && !p.endsWith(join("ui", "input.tsx")) ? [p] : []
  })
}

/** Every `<Input …>` / `<SearchField …>` opening tag, braces and strings skipped so `=>` doesn't end it. */
export function fieldTags(code: string): string[] {
  const tags: string[] = []
  const re = /<(Input|SearchField)\b/g
  let m: RegExpExecArray | null
  while ((m = re.exec(code))) {
    let depth = 0, quote = "", i = m.index + 1
    for (; i < code.length; i++) {
      const c = code[i]
      if (quote) { if (c === quote && code[i - 1] !== "\\") quote = ""; continue }
      if (c === '"' || c === "'" || c === "`") quote = c
      else if (c === "{") depth++
      else if (c === "}") depth--
      else if (c === ">" && depth === 0) break
    }
    tags.push(code.slice(m.index, i + 1))
    re.lastIndex = i + 1
  }
  return tags
}

/** The tag's own className value (not one inside a JSX prop such as `trailing`). */
export function ownClassName(tag: string): string {
  let depth = 0, quote = ""
  for (let i = 0; i < tag.length; i++) {
    const c = tag[i]
    if (quote) { if (c === quote && tag[i - 1] !== "\\") quote = ""; continue }
    if (depth === 0 && tag.startsWith("className=", i)) {
      const v = i + "className=".length
      if (tag[v] === '"') return tag.slice(v + 1, tag.indexOf('"', v + 1))
      if (tag[v] === "{") { let d = 0, j = v; for (; j < tag.length; j++) { if (tag[j] === "{") d++; else if (tag[j] === "}" && --d === 0) break } return tag.slice(v + 1, j) }
    }
    if (c === '"' || c === "'" || c === "`") quote = c
    else if (c === "{") depth++
    else if (c === "}") depth--
  }
  return ""
}

/** Classes that redraw the field box. */
const BOX = /(^|[\s"'`:])(border(-|\b)|bg-|rounded|shadow|ring-|outline-|h-\d|h-\[|py?-\d|px-\d)/

const tags = files(SRC).flatMap((p) => fieldTags(readFileSync(p, "utf8")).map((tag) => ({ file: relative(SRC, p), tag })))

describe("text field gate", () => {
  it("finds the app's fields", () => {
    expect(tags.length).toBeGreaterThan(20)
  })

  it("no call site redraws the field box", () => {
    const offenders = tags
      .map(({ file, tag }) => ({ file, cls: ownClassName(tag) }))
      .filter(({ cls }) => BOX.test(` ${cls}`))
    expect(offenders).toEqual([])
  })

  it("reads only the tag's own className", () => {
    expect(ownClassName(`<SearchField className="w-full" trailing={<Button className="h-6" />} />`)).toBe("w-full")
    expect(ownClassName(`<SearchField trailing={<Button className="h-6" />} />`)).toBe("")
    expect(ownClassName("<Input className={`min-w-0 ${x ? \"a\" : \"b\"}`} />")).toContain("min-w-0")
  })

  it("the tag reader keeps arrows and strings inside a tag", () => {
    expect(fieldTags(`<Input onChange={(e) => go(e)} placeholder="a > b" className="w-full" /> <SearchField size="panel" />`))
      .toEqual([`<Input onChange={(e) => go(e)} placeholder="a > b" className="w-full" />`, `<SearchField size="panel" />`])
  })
})
