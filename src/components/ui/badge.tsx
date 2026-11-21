import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "~src/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-md border font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        // Every variant: text ≥ 4.5:1 on its own fill, in both themes, at every
        // accent hue, on every surface a badge sits on (TASK-68; guarded by
        // src/components/contrast.browser.test.tsx). A label on the accent uses
        // the accent-fill tokens (TASK-48), never --accent itself.
        default:
          "border-transparent bg-[var(--accent-fill)] text-[var(--on-accent-fill)] shadow hover:brightness-[var(--accent-fill-hover)]",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        outline: "border-ink/10 text-fg-subtle",
        accent: "border-transparent bg-[color-mix(in_srgb,var(--accent-subtle)_50%,transparent)] text-fg-accent",
        success: "border-transparent bg-green-500/20 text-success",
        warning: "border-transparent bg-yellow-500/15 text-caution",
      },
      size: {
        default: "px-2.5 py-0.5 text-xs",
        sm: "px-1.5 py-0.5 text-[10px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

/**
 * The label sits in its own span so a constrained badge ends in "…" (an
 * ellipsis does not apply to text directly inside a flex box). Unconstrained,
 * it looks exactly as before (TASK-68).
 */
function Badge({ className, variant, size, children, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant, size }), "max-w-full", className)} {...props}>
      <span className="min-w-0 truncate">{children}</span>
    </div>
  )
}

export { Badge, badgeVariants }
