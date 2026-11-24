// Gate: nothing explains itself with the browser's native `title` tooltip. Every
// hover/focus explanation is the app Tooltip (IconTooltip, ClippedTooltip or a wrapping
// <Tooltip>), so one product shows one tooltip look, size and delay. A `title` prop is allowed
// only on the components below, where it is a heading the component renders, not a DOM attribute.
import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import ts from "typescript"

const SRC = join(__dirname, "..", "..")

/** Components whose `title` prop is visible heading text. Add one only if it never reaches the DOM as `title`. */
const HEADING_TITLE = new Set([
  "ModalHeader", "ModalOptionCard", "MergedList", "SourceColumn",
  "PickDestinationDialog", "ConfirmDialog", "LevelEmptyState", "StepHead", "SettingsSection", "SettingsListRow", "UsageRow",
])

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return files(p)
    return /\.tsx$/.test(name) && !/\.test\./.test(name) ? [p] : []
  })
}

/** Every JSX `title=` in `code`, with the tag it sits on and its line. */
export function titleAttributes(code: string, file = "x.tsx"): { tag: string; line: number }[] {
  const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const found: { tag: string; line: number }[] = []
  const visit = (node: ts.Node) => {
    if (ts.isJsxAttribute(node) && node.name.getText(sf) === "title") {
      const owner = node.parent.parent as ts.JsxOpeningLikeElement
      found.push({ tag: owner.tagName.getText(sf), line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1 })
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return found
}

const uses = files(SRC).flatMap((p) => titleAttributes(readFileSync(p, "utf8"), p).map((u) => ({ ...u, file: relative(SRC, p) })))

describe("native title gate", () => {
  it("finds the heading titles it allows", () => {
    expect(uses.length).toBeGreaterThan(10)
  })

  it("no element or component outside the heading list takes a title", () => {
    expect(uses.filter((u) => !HEADING_TITLE.has(u.tag)).map((u) => `${u.file}:${u.line} <${u.tag}>`)).toEqual([])
  })

  it("sees titles on DOM tags and on components, not in strings or text", () => {
    expect(titleAttributes(`const a = <span title="x">title="y"</span>; const b = "<a title='z'>"; const c = <Badge title={t} />`))
      .toEqual([{ tag: "span", line: 1 }, { tag: "Badge", line: 1 }])
  })
})
