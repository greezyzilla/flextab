import * as React from "react"
import { GripVertical } from "lucide-react"

import { Icon } from "~src/components/ui/icon"
import { cn } from "~src/lib/utils"

/**
 * The grip that takes a row's favicon slot while the row is hovered or the grip is focused
 * (tabs in a group, tabs in Opened tabs). It sits over the 20px icon slot, hidden until
 * its row's hover group (`reveal`, e.g. "group-hover/tab:opacity-100") or keyboard focus shows it.
 * The grip has no fill of its own: the favicon after it hides itself while it shows (the row's hover
 * group and peer-focus-visible), so the grip always sits on the row's own surface, resting, hovered,
 * in a coloured group or in light mode. A painted cover could match none of those. Spread the drag
 * library's attributes and listeners on it.
 */
export interface DragHandleProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  reveal: string
}

const DragHandle = React.forwardRef<HTMLButtonElement, DragHandleProps>(({ reveal, className, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    className={cn(
      "peer pointer-events-auto absolute -inset-0.5 z-10 flex cursor-grab items-center justify-center rounded opacity-0 outline-none transition-opacity focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-ring active:cursor-grabbing",
      reveal,
      className,
    )}
    {...props}
  >
    <Icon icon={GripVertical} size="sm" className="text-fg-muted" />
  </button>
))
DragHandle.displayName = "DragHandle"

export { DragHandle }
