/**
 * What changes when a saved tab is pointed at a new page (TASK-72), said the
 * way a person reads it: "Kusuriya no Hitorigoto Season 2: Episode 01 →
 * Episode 02", not two near-identical full titles to compare in your head.
 *
 * The words both titles share at the start are the name; the words they share
 * at the end (site boilerplate such as "Subtitle Indonesia - AnimeStream") are
 * dropped. A bare number that changed takes the word before it ("Episode",
 * "Chapter", "Part") so it reads on its own. When the titles are the same, the
 * end of the address is compared instead; when they share nothing, both full
 * titles are given.
 */
export interface Change {
  /** The shared start (show, course, article), or null when the titles share none. */
  name: string | null
  from: string
  to: string
}

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean)
const isBareNumber = (w: string) => /^[([#]?[\d.]+[)\]:,]?$/.test(w)
const trimEdges = (s: string) => s.replace(/^[([\s]+/, "").replace(/[)\]:,\s]+$/, "").trim()
const trimName = (s: string) => s.replace(/[\s([:\-–—|·,]+$/, "").trim()

function diff<T>(a: T[], b: T[]): { p: number; s: number } {
  let p = 0
  while (p < a.length && p < b.length && a[p] === b[p]) p++
  let s = 0
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++
  return { p, s }
}

function pathParts(url: string): string[] {
  try {
    const u = new URL(url)
    return (u.pathname + u.search).split("/").filter(Boolean)
  } catch {
    return []
  }
}

export function describeChange(before: { title: string; url: string }, after: { title?: string; url?: string }): Change {
  const a = words(before.title), b = words(after.title || before.title)
  let { p, s } = diff(a, b)
  let from = a.slice(p, a.length - s), to = b.slice(p, b.length - s)

  if (from.length === 0 && to.length === 0) {
    // Same title: tell the pages apart by the end of their addresses.
    const pa = pathParts(before.url), pb = pathParts(after.url ?? "")
    const d = diff(pa, pb)
    const tail = (parts: string[]) => {
      const keep = parts.slice(Math.max(0, d.p - 1), parts.length - d.s)
      return (d.p > 1 ? "…/" : "/") + keep.join("/")
    }
    return { name: trimName(before.title) || null, from: tail(pa), to: tail(pb) }
  }

  if (p > 0 && from.length <= 2 && to.length <= 2 && [...from, ...to].every(isBareNumber)) {
    p -= 1
    from = a.slice(p, a.length - s)
    to = b.slice(p, b.length - s)
  }
  const name = trimName(a.slice(0, p).join(" "))
  if (!name || from.length === 0 || to.length === 0) {
    // Reached only when the titles differ, so the new page has a title here.
    return { name: null, from: a.join(" "), to: b.join(" ") }
  }
  return { name, from: trimEdges(from.join(" ")), to: trimEdges(to.join(" ")) }
}

/**
 * A page title without the boilerplate its site puts on every page
 * ("… Subtitle Indonesia - AnimeStream"), found as the longest run of last
 * words it shares with another title from the same site. Words with a digit
 * are never boilerplate (episode, chapter, season), and at least two shared
 * words are needed, so a one-word site name alone is kept.
 */
export function stripSiteSuffix(title: string, siblings: string[]): string {
  const a = words(title)
  let best = 0
  for (const sibling of siblings) {
    const b = words(sibling)
    if (b.join(" ") === a.join(" ")) continue
    let s = 0
    while (s < a.length - 1 && s < b.length && a[a.length - 1 - s] === b[b.length - 1 - s] && !/\d/.test(a[a.length - 1 - s])) s++
    best = Math.max(best, s)
  }
  if (best < 2) return title
  return trimName(a.slice(0, a.length - best).join(" ")) || title
}
