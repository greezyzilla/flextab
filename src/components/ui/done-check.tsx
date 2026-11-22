import type { ReactNode } from "react"
import { Check } from "lucide-react"
import { cn } from "~src/lib/utils"
import { Icon, type IconSize } from "~src/components/ui/icon"

/**
 * The check of a finished moment (TASK-96): lucide's Check, revealed once from
 * left to right when it mounts (style.css `ft-done-check`), so it reads as
 * written, short stroke first, and a result that just happened reads as new.
 * The same check everywhere a thing finished: a step's tile, a settings row's
 * result line, a success toast.
 */
export function DoneCheck({ size = "md", className }: { size?: IconSize; className?: string }) {
  return <Icon icon={Check} size={size} className={cn("ft-done-check shrink-0", className)} />
}

/** A settings row's result, right where the action was: the check, then what is now true. */
export function DoneLine({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span role="status" className={cn("flex items-center gap-1.5 font-sans text-xs text-success", className)}>
      <DoneCheck size="sm" />
      <span>{children}</span>
    </span>
  )
}
