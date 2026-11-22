import * as React from "react"

import { cn } from "~src/lib/utils"

/**
 * A small outlined word beside a row's title that states a fact about it (TASK-103.5; Search's
 * "Open" and "Current"): 11px on an 18px line in a hairline box, the height of a Kbd cap, so it
 * lines up with the key hints in the same list. Not a control and not a count.
 */
const Tag = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(({ className, ...props }, ref) => (
  <span ref={ref} className={cn("rounded border border-ink/10 px-1.5 text-fg-muted text-caption leading-[18px]", className)} {...props} />
))
Tag.displayName = "Tag"

export { Tag }
