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
  /** Placement only (flex-1, shrink-0, self-*). */
  className?: string
}

const ROUND = { sm: "rounded", md: "rounded-md", lg: "rounded-lg", full: "rounded-full" } as const

/** Paints in the first frame: a wait is never hidden behind a delay. */
export function Skeleton({ width, height, line, round = "sm", tone = "base", className }: SkeletonProps) {
  const bar = (
    <span
      aria-hidden
      className={cn("block shrink-0 motion-safe:animate-pulse", tone === "faint" ? "bg-ink/[0.05]" : "bg-ink/[0.07]", ROUND[round], !line && className)}
      style={{ width, height }}
    />
  )
  if (line) return <span aria-hidden className={cn("flex items-center", className)} style={{ height: line }}>{bar}</span>
  return bar
}

/**
 * A region that is loading (TASK-106): announced once as a status with its `label` ("Loading your
 * workspace"), drawn in the first frame.
 */
export const SkeletonRegion = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & {
  label: string
}>(
  ({ label, className, children, ...props }, ref) => (
    <div ref={ref} role="status" aria-label={label} className={className} {...props}>
      {children}
    </div>
  ),
)
SkeletonRegion.displayName = "SkeletonRegion"
