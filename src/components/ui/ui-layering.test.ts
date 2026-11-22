// Gate for docs/ui-layering.md (TASK-103.1): every look flows token -> shared component
// (components/ui) -> variant. A call site only places a component; it never styles it.
//
// A. A component imported from components/ui receives a class that is not placement.
// B. A raw colour or arbitrary px/text/radius value in a .tsx outside components/ui.
// C. A native <button>, <input>, <select> or <textarea> outside components/ui.
//
// DEBT is today's findings, grouped by the subtask that clears them. It only shrinks: a new finding
// fails, and so does a cleared finding whose entry was not lowered.
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import ts from "typescript"
import { describe, expect, it } from "vitest"

const SRC = resolve(__dirname, "../..")
const UI = "components/ui/"
const GUIDE = "Looks live in components/ui variants; a call site only places a component. See flextab-fe/docs/ui-layering.md."

/**
 * Classes that place a component inside its parent: its behaviour as a flex or grid item, and
 * positioning, and a width cap in % of the parent (how much of its row it may take, TASK-103.6).
 * Width filling (w-full) and margins are not here: filling is the component's own prop or default,
 * and spacing between siblings is the parent's gap.
 */
const PLACEMENT =
  /^(?:max-w-\[\d+(?:\.\d+)?%\]|flex-(?:1|auto|initial|none)|grow(?:-\d+)?|shrink(?:-\d+)?|basis-.+|min-[wh]-0|self-.+|justify-self-.+|place-self-.+|order-.+|col-(?:auto|span-.+|start-.+|end-.+)|row-(?:auto|span-.+|start-.+|end-.+)|static|relative|absolute|fixed|sticky|inset(?:-[xy])?-.+|top-.+|right-.+|bottom-.+|left-.+|z-.+|group(?:\/.+)?|peer(?:\/.+)?)$/

/** docs/icon-standard.md: an icon takes its colour and rotation from the call site, never its size or stroke. */
const ICON_EXTRA = /^(?:text-(?!(?:xs|sm|base|lg|\d?xl)$|\[).+|rotate-.+|transition(?:-transform)?|duration-.+|ease-.+|animate-(?:spin|none))$/

const RAW = [
  /(?<=^|[[(,:=_"']|(?:\d|px|\))\s)#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g, // hex colour in a value position, not "Invoice #2291"
  /\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\((?!\s*(?:from|var)\b)/g, // colour function on literal numbers
  /\[[^\]\s]*?\d(?:\.\d+)?px[^\]\s]*\]/g, // arbitrary px: py-[11px], text-[15px], grid-cols-[20px_1fr]
  /\b(?:text|rounded(?:-[a-z]+)?)-\[\d[^\]]*\](?<!px\])/g, // arbitrary type size or radius in other units
]

const NATIVE = new Set(["button", "input", "select", "textarea"])

type Finding = { file: string; line: number; key: string; detail: string }

/** The utility a class token applies once its variants (hover:, md:, data-[x]:) and ! are removed. */
export function utility(token: string): string {
  let depth = 0
  let start = 0
  for (let i = 0; i < token.length; i++) {
    if (token[i] === "[") depth++
    else if (token[i] === "]") depth--
    else if (token[i] === ":" && depth === 0) start = i + 1
  }
  return token.slice(start).replace(/^!|!$/g, "").replace(/^-/, "")
}

const COMPARISON = new Set([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
])

/** Every string piece under a node (literals, template parts, quoted object keys), skipping comparisons. */
function strings(node: ts.Node, out: { text: string; node: ts.Node }[] = []) {
  if (ts.isBinaryExpression(node) && COMPARISON.has(node.operatorToken.kind)) return out
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return out
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) out.push({ text: node.text, node })
  else if (ts.isTemplateExpression(node)) {
    out.push({ text: node.head.text, node: node.head })
    for (const span of node.templateSpans) out.push({ text: span.literal.text, node: span.literal })
  }
  ts.forEachChild(node, (child) => void strings(child, out))
  return out
}

function attr(el: ts.JsxOpeningLikeElement, name: string) {
  return el.attributes.properties.find((p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText() === name)
}

/** A native input nobody sees (file pickers, visually hidden radios) carries no look of its own. */
function invisible(el: ts.JsxOpeningLikeElement) {
  const type = attr(el, "type")?.initializer
  if (type && ts.isStringLiteral(type) && type.text === "hidden") return true
  const cls = attr(el, "className")?.initializer
  return !!cls && strings(cls).some((s) => s.text.split(/\s+/).some((t) => t === "hidden" || t === "sr-only"))
}

/** Findings for one source file. `file` is relative to src. */
export function scan(file: string, code: string): Finding[] {
  if (file.startsWith(UI)) return []
  const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const line = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1
  const found: Finding[] = []

  const uiNames = new Set<string>()
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue
    const from = st.moduleSpecifier.text
    const isUi = from.includes("components/ui/") || (file.startsWith("components/") && /^\.\.?\/ui\//.test(from))
    const named = st.importClause?.namedBindings
    if (isUi && named && ts.isNamedImports(named)) for (const el of named.elements) if (!el.isTypeOnly) uiNames.add(el.name.text)
  }

  // B. raw values in any string of the file.
  for (const s of strings(sf))
    for (const re of RAW) for (const m of s.text.matchAll(re)) found.push({ file, line: line(s.node), key: "B", detail: m[0] })

  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(sf)
      // A. look classes on a shared component.
      if (uiNames.has(tag)) {
        const cls = attr(node, "className")?.initializer
        for (const s of cls ? strings(cls) : [])
          for (const token of s.text.split(/\s+/).filter(Boolean)) {
            const u = utility(token)
            if (PLACEMENT.test(u) || (tag === "Icon" && ICON_EXTRA.test(u))) continue
            found.push({ file, line: line(s.node), key: `A ${tag}`, detail: token })
          }
      }
      // C. native controls.
      if (NATIVE.has(tag) && !(tag === "input" && invisible(node))) found.push({ file, line: line(node), key: `C <${tag}>`, detail: `<${tag}>` })
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return found
}

/** Which subtask clears a finding. */
function clearedBy(key: string) {
  if (key === "B") return "TASK-103.5"
  if (key === "C <button>") return "TASK-103.4"
  if (key.startsWith("C ")) return "TASK-103.3"
  const tag = key.slice(2)
  if (tag === "Button" || tag === "IconButton") return "TASK-103.2"
  if (tag === "Input" || tag.startsWith("Select")) return "TASK-103.3"
  return "TASK-103.6"
}

type Debt = Record<string, Record<string, Record<string, number>>>

/**
 * Colours that are data, not style (TASK-103.5): literal on purpose, so no theme or accent change
 * alters them. They live only in these files (.ts, which rule B does not read), each with its reason.
 */
const DATA_COLOURS: Record<string, string> = {
  "lib/data-colours.ts":
    "provider brand colours (their guidelines fix them); the space colours (a space stores and syncs the hex, so a value can never change); the accent hue picker's spectrum (the hue is the setting's value)",
}

/** Today's findings (fe dev 4f80647), by the subtask that clears them. Only ever lower or remove an entry. */
const DEBT: Debt = {
}

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return sources(p)
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [p] : []
  })
}

function tally(findings: Finding[]): Debt {
  const out: Debt = {}
  for (const f of findings) {
    const task = (out[clearedBy(f.key)] ??= {})
    const file = (task[f.file] ??= {})
    file[f.key] = (file[f.key] ?? 0) + 1
  }
  return out
}

describe("ui layering (docs/ui-layering.md)", () => {
  const findings = sources(SRC).flatMap((p) => scan(relative(SRC, p), readFileSync(p, "utf8")))

  it("adds no look outside the shared layer, and lists no finding that is gone", () => {
    const found = tally(findings)
    const problems: string[] = []
    const tasks = new Set([...Object.keys(found), ...Object.keys(DEBT)])
    for (const task of tasks) {
      const files = new Set([...Object.keys(found[task] ?? {}), ...Object.keys(DEBT[task] ?? {})])
      for (const file of files) {
        const keys = new Set([...Object.keys(found[task]?.[file] ?? {}), ...Object.keys(DEBT[task]?.[file] ?? {})])
        for (const key of keys) {
          const has = found[task]?.[file]?.[key] ?? 0
          const allowed = DEBT[task]?.[file]?.[key] ?? 0
          if (has > allowed)
            for (const f of findings.filter((x) => x.file === file && x.key === key))
              problems.push(`${f.file}:${f.line}  ${key}  ${f.detail}  (${allowed} allowed until ${task})`)
          else if (has < allowed) problems.push(`stale: ${task} ${file} "${key}" lists ${allowed}, found ${has}. Lower the entry in ui-layering.test.ts.`)
        }
      }
    }
    expect(problems, GUIDE).toEqual([])
  })

  it("keeps data colours in the files it lists, each with a reason", () => {
    for (const [file, reason] of Object.entries(DATA_COLOURS)) {
      expect(statSync(join(SRC, file)).isFile(), file).toBe(true)
      expect(reason.length, file).toBeGreaterThan(20)
    }
  })
})

describe("ui layering scanner", () => {
  const head = `import { Button } from "~src/components/ui/button"\nimport { Icon } from "~src/components/ui/icon"\n`
  const keys = (body: string) => scan("components/Example.tsx", head + body).map((f) => `${f.key} ${f.detail} :${f.line}`)

  it("names the file, line and class of a look passed to a shared component", () => {
    expect(scan("components/Example.tsx", head + `const a = <Button className="h-7 text-xs text-fg-subtle" />`)).toEqual([
      { file: "components/Example.tsx", line: 3, key: "A Button", detail: "h-7" },
      { file: "components/Example.tsx", line: 3, key: "A Button", detail: "text-xs" },
      { file: "components/Example.tsx", line: 3, key: "A Button", detail: "text-fg-subtle" },
    ])
  })

  it("reads classes inside cn(), templates and conditions, through variants and !", () => {
    expect(keys(`const a = <Button className={cn("flex-1", on ? "hover:!bg-ink/10" : "", \`md:rounded-\${r}\`)} />`)).toEqual([
      "A Button hover:!bg-ink/10 :3",
      "A Button md:rounded- :3",
    ])
  })

  it("lets placement through: flex and grid item behaviour, self alignment, order, position", () => {
    expect(keys(`const a = <Button className="flex-1 min-w-0 shrink-0 self-end md:order-2 col-span-2 absolute right-2 z-10" />`)).toEqual([])
  })

  it("lets a width cap in % of the parent through, but not a fixed cap", () => {
    expect(keys(`const a = <Button className="shrink-0 max-w-[40%]" />`)).toEqual([])
    expect(keys(`const a = <Button className="max-w-[12rem]" />`)).toEqual(["A Button max-w-[12rem] :3"])
  })

  it("does not count width filling or margins as placement", () => {
    expect(keys(`const a = <Button className="w-full mt-2 -mx-1" />`)).toEqual(["A Button w-full :3", "A Button mt-2 :3", "A Button -mx-1 :3"])
  })

  it("allows an icon its colour and rotation, but not its size", () => {
    expect(keys(`const a = <Icon className="text-fg-subtle rotate-90 transition-transform shrink-0 h-4 w-4 text-sm" />`)).toEqual([
      "A Icon h-4 :3",
      "A Icon w-4 :3",
      "A Icon text-sm :3",
    ])
  })

  it("flags raw colours and arbitrary px, type and radius values anywhere in the file", () => {
    expect(keys(`const a = <div className="py-[11px] text-[0.8rem] rounded-[10px] bg-[#fff]" style={{ color: "rgb(0 0 0)", boxShadow: "0 1px 2px #000" }} />`)).toEqual([
      "B #fff :3",
      "B [11px] :3",
      "B [10px] :3",
      "B text-[0.8rem] :3",
      "B rgb( :3",
      "B #000 :3",
    ])
  })

  it("leaves token colours, relative colours, links and comparisons alone", () => {
    expect(keys(`const a = <a href="https://x.dev/#top" title="Invoice #2291" className="bg-ink/[0.06] text-[var(--accent)]" style={{ color: "oklch(from var(--fg) l c h)" }}>{k === "#fff" ? 1 : 2}</a>`)).toEqual([])
  })

  it("flags native controls, except inputs nobody sees", () => {
    expect(
      keys(`const a = <><button /><select /><textarea /><input type="checkbox" /><input type="file" className="hidden" /><input type="radio" className="sr-only" /><input type="hidden" /></>`),
    ).toEqual(["C <button> <button> :3", "C <select> <select> :3", "C <textarea> <textarea> :3", "C <input> <input> :3"])
  })

  it("does not scan the shared layer itself", () => {
    expect(scan("components/ui/button.tsx", `const a = <button className="h-7 text-[13px] bg-[#fff]" />`)).toEqual([])
  })
})
