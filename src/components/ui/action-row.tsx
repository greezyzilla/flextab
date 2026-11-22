import * as React from "react"
import type { LucideIcon } from "lucide-react"

import { Icon } from "~src/components/ui/icon"
import { cn } from "~src/lib/utils"

/**
 * The popup's actions (TASK-103.4): one rounded box (ActionList) of full-width rows (ActionRow),
 * an icon and a short label each, a hairline between rows. A row that opens something below it
 * (a picker) passes `expanded`: announced, and its fill held while open. Long labels wrap.
 */
const ActionList = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("overflow-hidden rounded-popup bg-ink/[0.04]", className)} {...props} />
))
ActionList.displayName = "ActionList"

export interface ActionRowProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon
  expanded?: boolean
}

const ActionRow = React.forwardRef<HTMLButtonElement, ActionRowProps>(({ icon, expanded, className, children, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    aria-expanded={expanded}
    className={cn(
      "grid min-h-11 w-full grid-cols-[20px_minmax(0,1fr)] items-center gap-x-3 px-3 py-[11px] text-left text-popup text-fg outline-none transition-colors [overflow-wrap:anywhere] [&+&]:border-t [&+&]:border-ink/[0.07] hover:bg-ink/[0.05] focus-visible:bg-ink/[0.07] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-50",
      expanded && "bg-ink/[0.07]",
      className,
    )}
    {...props}
  >
    <Icon icon={icon} size="lg" className="text-fg-muted" />
    <span className="[text-wrap:pretty]">{children}</span>
  </button>
))
ActionRow.displayName = "ActionRow"

export { ActionList, ActionRow }
