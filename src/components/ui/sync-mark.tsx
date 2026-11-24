import type { LucideIcon } from "lucide-react"

/**
 * The header's sync status: the state's glyph at 18px, a fixed 1.75 stroke (it is a
 * status, so it does not follow Settings › Icon weight), spinning while it syncs. `tone` is its
 * colour class. Sits in a `relative` button, with SyncDirtyDot as that button's last child.
 */
export function SyncGlyph({ icon: Glyph, tone, spin }: { icon: LucideIcon; tone: string; spin: boolean }) {
  return <Glyph className={`h-[18px] w-[18px] ${tone} ${spin ? "animate-spin" : ""}`} strokeWidth={1.75} aria-hidden />
}

/** The 7px dot on the glyph's top-right shoulder: there are changes not synced yet. */
export function SyncDirtyDot() {
  return <span className="absolute left-[19px] top-1.5 h-[7px] w-[7px] rounded-full bg-amber-400 ring-2 ring-black-900" aria-hidden />
}
