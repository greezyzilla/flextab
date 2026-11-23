import type { ReactElement } from "react"
import { cn } from "~src/lib/utils"
import { shortcutKeys } from "~src/lib/platform"
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip"

/** Keys of a shortcut ("Mod+Shift+S"), each in its own key cap, platform-correct. */
export function Kbd({ shortcut, className }: { shortcut: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      {shortcutKeys(shortcut).map((k, i) => (
        <kbd key={i} className="min-w-[18px] rounded border border-ink/15 bg-ink/[0.06] px-1 text-center font-sans text-caption leading-[18px] text-fg-muted">{k}</kbd>
      ))}
    </span>
  )
}

/**
 * Shows a control's keyboard shortcut where the control is (TASK-13): people
 * learn a shortcut while using the button, not from a list they never open.
 */
export function ShortcutTooltip({ label, shortcut, side = "bottom", children }: {
  label: string; shortcut: string; side?: "top" | "bottom" | "left" | "right"; children: ReactElement
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      {/* The label and its keys 8px apart on their own row: TooltipContent puts its children in a text
          span, so a gap on the tooltip box would not reach them (TASK-119). */}
      <TooltipContent side={side}>
        <span data-slot="shortcut-tip" className="inline-flex flex-wrap items-center gap-2">
          {label}
          <Kbd shortcut={shortcut} />
        </span>
      </TooltipContent>
    </Tooltip>
  )
}
