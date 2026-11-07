// Commands ⌘K can run (TASK-16): for now the theme, the way Linear, GitHub and
// VS Code expose it from their palettes. Pure: the palette renders and runs them.

import type { ThemeMode } from "~src/lib/theme"
import { rank } from "./searchIndex"

export interface ActionHit {
  kind: "action"
  key: string
  title: string
  /** The theme this command switches to. */
  theme: ThemeMode
  /** It is the theme in use, so running it changes nothing. */
  current: boolean
}

const THEME_ACTIONS: { theme: ThemeMode; title: string; words: string[] }[] = [
  { theme: "system", title: "Use system theme", words: ["theme", "mode", "appearance", "auto", "device", "os"] },
  { theme: "light", title: "Use light theme", words: ["theme", "mode", "appearance", "day"] },
  { theme: "dark", title: "Use dark theme", words: ["theme", "mode", "appearance", "night"] },
]

/** Commands whose title or keywords start with the query. Two letters at least,
 *  so a single keystroke doesn't add an Actions section to every search. */
export function searchActions(rawQuery: string, theme: ThemeMode): ActionHit[] {
  const q = rawQuery.trim().toLowerCase()
  if (q.length < 2) return []
  const hits: { hit: ActionHit; score: number }[] = []
  for (const a of THEME_ACTIONS) {
    const byTitle = rank(q, a.title)
    const score = byTitle ?? (a.words.some((w) => w.startsWith(q)) ? 1 : null)
    if (score === null) continue
    hits.push({ hit: { kind: "action", key: `action:theme:${a.theme}`, title: a.title, theme: a.theme, current: a.theme === theme }, score })
  }
  return hits.sort((x, y) => x.score - y.score).map((h) => h.hit)
}
