import * as React from "react"

import { cn } from "~src/lib/utils"

/**
 * The shape of something still loading (TASK-106): a faint ink bar that pulses only when motion is
 * allowed. Its size is a prop, as Radix Themes' Skeleton (`width`, `height` in px or any CSS
 * length), because a skeleton stands in for one particular thing. `line` puts the bar in a text
 * line box of that height, so a skeleton line takes the place of the text it stands for and nothing
 * moves when the text arrives. `tone` faint is the quieter second line (a row's meta).
 */
export interface SkeletonProps {
  width?: number | string
  height?: number | string
  line?: number | string
  round?: "sm" | "md" | "lg" | "full"
  tone?: "base" | "faint"
  /** Inside a region that already announces itself: wait 200ms before showing, as SkeletonRegion does. */
  late?: boolean
  /** Placement only (flex-1, shrink-0, self-*). */
  className?: string
}

const ROUND = { sm: "rounded", md: "rounded-md", lg: "rounded-lg", full: "rounded-full" } as const

export function Skeleton({ width, height, line, round = "sm", tone = "base", late = false, className }: SkeletonProps) {
  const bar = (
    <span
      aria-hidden
      className={cn("block shrink-0 motion-safe:animate-pulse", tone === "faint" ? "bg-ink/[0.05]" : "bg-ink/[0.07]", ROUND[round], !line && !late && className)}
      style={{ width, height }}
    />
  )
  // The 200ms wait sits on a wrapper: the bar's own animation is the pulse, and one element
  // cannot run both (the later animation rule would drop the delay).
  if (line) return <span aria-hidden className={cn("flex items-center", late && "animate-appear-late", className)} style={{ height: line }}>{bar}</span>
  if (late) return <span aria-hidden className={cn("block shrink-0 animate-appear-late", className)}>{bar}</span>
  return bar
}

/**
 * A region that is loading (TASK-106): announced once as a status with its `label` ("Loading your
 * workspace"), and drawn only after 200ms, so a load that finishes sooner shows nothing at all.
 */
export const SkeletonRegion = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & {
  label: string
  /** false: the region (its frame) shows at once and only its Skeletons, given `late`, wait. */
  late?: boolean
}>(
  ({ label, late = true, className, children, ...props }, ref) => (
    <div ref={ref} role="status" aria-label={label} className={cn(late && "animate-appear-late", className)} {...props}>
      {children}
    </div>
  ),
)
SkeletonRegion.displayName = "SkeletonRegion"
