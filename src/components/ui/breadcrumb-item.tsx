import * as React from "react"

import { cn } from "~src/lib/utils"

/**
 * One step of a breadcrumb trail (the content panel's project › category). Pass the
 * level icon and the name as children. The step you are on (`current`) is announced
 * (aria-current="location") and rests quieter; the steps above it rest at fg and firm to ink.
 * Its 4px side padding is cancelled by a margin, so its text sits on the trail's text edge.
 */
export interface BreadcrumbItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  current?: boolean
}

const BreadcrumbItem = React.forwardRef<HTMLButtonElement, BreadcrumbItemProps>(({ current = false, className, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    aria-current={current ? "location" : undefined}
    className={cn(
      "-mx-1 flex min-w-0 items-center gap-1.5 rounded px-1 outline-none focus-visible:ring-1 focus-visible:ring-ring",
      current ? "text-fg-muted hover:text-fg" : "text-fg hover:text-ink",
      className,
    )}
    {...props}
  />
))
BreadcrumbItem.displayName = "BreadcrumbItem"

export { BreadcrumbItem }
