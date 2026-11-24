import type { LucideIcon } from "lucide-react"
import { cn } from "~src/lib/utils"
import { useSettingsStore } from "~src/store/useSettingsStore"

/**
 * The one way FlexTab draws an icon (TASK-76, docs/icon-standard.md): a Lucide
 * glyph at a size from the scale and at the stroke weight chosen in Settings ›
 * Appearance. Colour comes from the text colour around it (currentColor), so
 * an icon follows its button's rest, hover, active and disabled states.
 *
 * Sizes, by context:
 * - xs 12px: a small mark in a dense row (a category in the sidebar tree)
 * - sm 14px: row actions, tree rows, breadcrumbs, icons inline with text
 * - md 16px: header tools, menu items, dialog close, search fields
 * - lg 20px: the rail, main navigation, popup actions
 * - xl 24px: page headings and empty states
 * - badge 8px / badge-lg 11px: a mark on top of another icon (the green
 *   "saved" check); drawn heavier so it stays legible that small.
 */
export type IconSize = "xs" | "sm" | "md" | "lg" | "xl" | "badge" | "badge-lg"

const SIZE: Record<IconSize, string> = {
  xs: "h-3 w-3",
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-5 w-5",
  xl: "h-6 w-6",
  badge: "h-2 w-2",
  "badge-lg": "h-[11px] w-[11px]",
}

/** A badge glyph is only a few pixels wide; at the regular weight it would fade. */
const BADGE_STROKE = 3.5

/** The stroke weights Settings › Appearance › Icon weight offers. */
export const ICON_STROKES = { thin: 1.5, regular: 1.75, bold: 2 } as const
export type IconWeight = keyof typeof ICON_STROKES

export function Icon({ icon: Glyph, size = "sm", className, label, ...data }: {
  icon: LucideIcon
  size?: IconSize
  /** Colour, rotation, placement. Never a size or a stroke: those come from the scale and Settings. */
  className?: string
  /** Names the icon for assistive tech when nothing else does; otherwise it is hidden from it. */
  label?: string
  /** data-* hooks for tests and styling. */
  [data: `data-${string}`]: string | undefined
}) {
  const weight = useSettingsStore((s) => s.iconWeight)
  const badge = size === "badge" || size === "badge-lg"
  return (
    <Glyph
      className={cn("shrink-0", SIZE[size], className)}
      strokeWidth={badge ? BADGE_STROKE : ICON_STROKES[weight] ?? ICON_STROKES.regular}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
      {...data}
    />
  )
}
