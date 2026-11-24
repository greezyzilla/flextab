// What a sync merge changes, in words (TASK-29). The resolver shows this like
// `git status` shows auto-merged files: before Apply, the user can see what
// arrives on this device and what goes to the account, not only the conflicts.
//
// Pure, and read-only over merge3: it never changes what merge3 decides. The
// auto-merged changes for one side are merge3 with every conflict kept on that
// side, compared with that side's own tree, so conflicts never show up here.

import type { SavedSpace } from "~src/types"
import { merge3, type Conflict, type Resolutions } from "./spacesMerge3"
import { GROUP_COLORS } from "~src/lib/groupColors"

export type Level = "space" | "project" | "category" | "group" | "tab"

const LEVELS: Level[] = ["space", "project", "category", "group", "tab"]
const CHILDREN: Record<Level, string | null> = {
  space: "projects", project: "categories", category: "groups", group: "tabs", tab: null,
}

export const LEVEL_LABEL: Record<Level, string> = {
  space: "Space", project: "Project", category: "Category", group: "Group", tab: "Tab",
}

type Node = { id: string } & Record<string, unknown>

export interface Located {
  level: Level
  /** Ancestor names, outermost first (empty for a space). */
  path: string[]
  node: Node
  /** The parent's index key, or null for a space. */
  parentId: string | null
  /** Index keys of the ancestors, outermost first (parallel to `path`). */
  ancestors: string[]
}

/** Index key: ids are matched per level, like merge3 does. */
const keyOf = (level: Level, id: string) => `${level}:${id}`

function nameOf(n: Node, level: Level): string {
  const raw = level === "tab" ? n.title || n.url : n.name
  return raw ? String(raw) : "(untitled)"
}

/** A located node's display name (a tab's title, or its address). */
export const locatedName = (loc: Located): string => nameOf(loc.node, loc.level)

/** Every node of a tree by level + id (see keyOf), with its ancestors. */
export function indexTree(spaces: SavedSpace[] | null | undefined): Map<string, Located> {
  const out = new Map<string, Located>()
  const walk = (nodes: Node[], depth: number, path: string[], parentId: string | null, ancestors: string[] = []) => {
    const level = LEVELS[depth]
    for (const node of nodes) {
      if (!node || typeof node.id !== "string") continue
      const self = keyOf(level, node.id)
      out.set(self, { level, path, node, parentId, ancestors })
      const key = CHILDREN[level]
      if (key) walk((node[key] as Node[]) ?? [], depth + 1, [...path, nameOf(node, level)], self, [...ancestors, self])
    }
  }
  walk((spaces ?? []) as unknown as Node[], 0, [], null)
  return out
}

/** Find a node in the first tree that has it. */
export function locate(id: string, ...trees: (SavedSpace[] | null | undefined)[]): Located | undefined {
  for (const t of trees) {
    const index = indexTree(t)
    for (const level of LEVELS) {
      const hit = index.get(keyOf(level, id))
      if (hit) return hit
    }
  }
  return undefined
}

function tabsUnder(n: Node, level: Level): number {
  if (level === "tab") return 1
  const key = CHILDREN[level]!
  const next = LEVELS[LEVELS.indexOf(level) + 1]
  return ((n[key] as Node[]) ?? []).reduce((sum, c) => sum + tabsUnder(c, next), 0)
}

export type ChangeKind = "added" | "removed" | "moved" | "renamed" | "edited"

/** A look-only field that changed on an item kept under the same name. */
export type StyleField = "color" | "abbreviation"

export interface Change {
  kind: ChangeKind
  level: Level
  /** For tab add/remove/move, how many tabs this line stands for. */
  count: number
  name: string
  /** Where it is (or was, for a removal), outermost first. */
  path: string[]
  /** renamed: the new name; moved: the destination path; a style edit: the
   *  new value in words, when it has one ("" when it was cleared). */
  to?: string
  /** edited: which look-only field changed. Absent for a tab's address. */
  field?: StyleField
  /** Tabs inside an added/removed container. */
  tabs?: number
}

/**
 * The changes that turn `from` into `to`, in words a person would use: tabs
 * added to or removed from a group are counted per group, a removed or added
 * container is one line (its contents are not repeated), and a tab dragged to
 * another group is a move.
 */
export function diffTrees(from: SavedSpace[] | null, to: SavedSpace[], names?: SavedSpace[] | null): Change[] {
  const a = indexTree(from), b = indexTree(to)
  // With `names` (the merge base), places are named as they were there, so a
  // container renamed on either side reads the same on every line.
  const named = names ? indexTree(names) : null
  const place = (loc: Located): string[] =>
    named ? loc.ancestors.map((k, i) => { const n = named.get(k); return n ? locatedName(n) : loc.path[i] }) : loc.path
  const out: Change[] = []
  const tabBuckets = new Map<string, Change>()
  const bucket = (kind: "added" | "removed" | "moved", loc: Located, dest?: string) => {
    const k = `${kind}|${loc.parentId}|${dest ?? ""}`
    const hit = tabBuckets.get(k)
    if (hit) { hit.count++; return }
    const line: Change = { kind, level: "tab", count: 1, name: nameOf(loc.node, "tab"), path: place(loc), to: dest }
    tabBuckets.set(k, line)
    out.push(line)
  }

  for (const [id, loc] of b) {
    const prev = a.get(id)
    if (!prev) {
      // Inside a container that is new as a whole: the container's line covers it.
      if (loc.parentId && !a.has(loc.parentId)) continue
      if (loc.level === "tab") bucket("added", loc)
      else out.push({ kind: "added", level: loc.level, count: 1, name: nameOf(loc.node, loc.level), path: place(loc), tabs: tabsUnder(loc.node, loc.level) })
      continue
    }
    if (prev.parentId !== loc.parentId) {
      if (loc.level === "tab") bucket("moved", prev, place(loc).join(" › "))
      // A container moved as a whole (TASK-59): one line, its contents go with it.
      else out.push({ kind: "moved", level: loc.level, count: 1, name: nameOf(prev.node, prev.level), path: place(prev), to: place(loc).join(" › ") })
    }
    const before = nameOf(prev.node, prev.level), after = nameOf(loc.node, loc.level)
    if (before !== after) out.push({ kind: "renamed", level: loc.level, count: 1, name: before, path: place(loc), to: after })
    else if (loc.level === "tab" && prev.node.url !== loc.node.url) {
      out.push({ kind: "edited", level: "tab", count: 1, name: after, path: place(loc) })
    }
    for (const field of STYLE_FIELDS[loc.level]) {
      const was = styleValue(prev.node[field]), now = styleValue(loc.node[field])
      if (was === now) continue
      out.push({ kind: "edited", level: loc.level, count: 1, name: after, path: place(loc), field, to: styleText(loc.level, field, now) })
    }
  }
  for (const [id, loc] of a) {
    if (b.has(id)) continue
    if (loc.parentId && !b.has(loc.parentId)) continue // its container's removal covers it
    if (loc.level === "tab") bucket("removed", loc)
    else out.push({ kind: "removed", level: loc.level, count: 1, name: nameOf(loc.node, loc.level), path: place(loc), tabs: tabsUnder(loc.node, loc.level) })
  }
  return out
}

// The look-only fields people can change per level (Settings › Spaces, and a
// group's ⋯ › Color). A space's icon has no editor, so it is not listed.
const STYLE_FIELDS: Record<Level, StyleField[]> = {
  space: ["color", "abbreviation"], project: [], category: [], group: ["color"], tab: [],
}
const FIELD_NOUN: Record<StyleField, string> = { color: "color", abbreviation: "short name" }
/** Missing, null and "" are the same unset value, as in merge3. */
const styleValue = (v: unknown): string => (v === undefined || v === null ? "" : String(v))
/** The new value in words: a group colour by its menu name, a short name as
 *  typed. A space colour is a swatch with no stable name here, so it has none. */
function styleText(level: Level, field: StyleField, value: string): string | undefined {
  if (!value) return ""
  if (field === "abbreviation") return `“${value}”`
  if (level === "group") return GROUP_COLORS.find((c) => c.id === value)?.label
  return undefined
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`
const where = (path: string[]) => (path.length ? path.join(" › ") : "")

/** One line of plain English for a change. */
export function changeText(c: Change): string {
  const at = where(c.path)
  if (c.level === "tab" && c.kind !== "renamed" && c.kind !== "edited") {
    if (c.kind === "added") return `${c.count === 1 ? `Added “${c.name}”` : `Added ${plural(c.count, "tab")}`} in ${at}`
    if (c.kind === "removed") return `${c.count === 1 ? `Removed “${c.name}”` : `Removed ${plural(c.count, "tab")}`} from ${at}`
    return `${c.count === 1 ? `Moved “${c.name}”` : `Moved ${plural(c.count, "tab")}`} from ${at} to ${c.to}`
  }
  const what = `${LEVEL_LABEL[c.level].toLowerCase()} “${c.name}”`
  const inside = c.tabs !== undefined ? ` (${plural(c.tabs, "tab")})` : ""
  const suffix = at ? ` in ${at}` : ""
  if (c.kind === "edited" && c.field) {
    const noun = FIELD_NOUN[c.field]
    if (c.to === "") return `Removed the ${noun} of ${what}${suffix}`
    return `Changed the ${noun} of ${what}${c.to ? ` to ${c.to}` : ""}${suffix}`
  }
  switch (c.kind) {
    case "added": return `Added ${what}${suffix}${inside}`
    case "removed": return `Removed ${what}${suffix ? ` from ${at}` : ""}${inside}`
    case "renamed": return `Renamed ${what} to “${c.to}”${suffix}`
    case "moved": return `Moved ${what} from ${at} to ${c.to}`
    default: return `Changed ${what}${suffix}`
  }
}

function allTo(conflicts: Conflict[], side: "server" | "local"): Resolutions {
  return Object.fromEntries(conflicts.map((c) => [c.key, side]))
}

/**
 * What the merge applies by itself, per side: `fromAccount` is what arrives on
 * this device, `fromDevice` what goes to the account. Conflicts are left out:
 * they are the user's to choose.
 */
export function autoMerged(base: SavedSpace[] | null, server: SavedSpace[], local: SavedSpace[], conflicts: Conflict[]) {
  const onDevice = merge3(base, server, local, allTo(conflicts, "local")).merged
  const inAccount = merge3(base, server, local, allTo(conflicts, "server")).merged
  return { fromAccount: diffTrees(local, onDevice, base), fromDevice: diffTrees(server, inAccount, base) }
}

/** What one side did to an item since the base, in a short phrase ("renamed to X, 2 tabs added"). */
export function editSummary(baseNode: Node | undefined, edited: Node, level: Level): string {
  if (!baseNode) return "changed it"
  const wrap = (n: Node): SavedSpace[] => {
    // Re-root the item as a one-node tree at its own level so diffTrees can walk it.
    let node: Node = n
    for (let i = LEVELS.indexOf(level) - 1; i >= 0; i--) node = { id: `__root${i}`, name: "", [CHILDREN[LEVELS[i]]!]: [node] }
    return [node as unknown as SavedSpace]
  }
  const changes = diffTrees(wrap(baseNode), wrap(edited))
  const parts: string[] = []
  for (const c of changes) {
    if (c.kind === "renamed" && c.level === level) parts.push(`renamed it to “${c.to}”`)
    else if (c.kind === "edited" && c.field) parts.push(styleSummary(c, c.level === level))
    else if (c.kind === "edited" && c.level === level) parts.push("changed its address")
    else if (c.level === "tab" && c.kind === "added") parts.push(`added ${plural(c.count, "tab")}`)
    else if (c.level === "tab" && c.kind === "removed") parts.push(`removed ${plural(c.count, "tab")}`)
    else if (c.level === "tab" && c.kind === "moved") parts.push(`moved ${plural(c.count, "tab")}`)
    else if (c.kind === "renamed") parts.push(`renamed ${c.level === "tab" ? "tab" : LEVEL_LABEL[c.level].toLowerCase()} “${c.name}” to “${c.to}”`)
    else if (c.kind === "edited") parts.push(`changed the address of “${c.name}”`)
    else parts.push(`${c.kind} ${LEVEL_LABEL[c.level].toLowerCase()} “${c.name}”`)
  }
  return parts.length ? parts.join(", ") : "changed it"
}

/** One style edit inside a short phrase: on the item itself "changed its
 *  color to Red", on something inside it "removed the color of group “Later”". */
function styleSummary(c: Change, own: boolean): string {
  const noun = FIELD_NOUN[c.field!]
  const object = own ? `its ${noun}` : `the ${noun} of ${LEVEL_LABEL[c.level].toLowerCase()} “${c.name}”`
  if (c.to === "") return `removed ${object}`
  return `changed ${object}${c.to ? ` to ${c.to}` : ""}`
}
