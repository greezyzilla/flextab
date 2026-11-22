import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "~src/lib/utils"

/**
 * A 40px round button on the left rail (TASK-103.4). One shape and one keyboard focus (a 2px ring
 * set off from the button) for every rail control; `look` sets its surface:
 *   solid  — Settings, Sign in: a quiet fill that firms on hover.
 *   dashed — Add space: an empty slot.
 *   avatar — a space: colours come from the space (style), hover brightens it.
 *   bare   — wraps something round of its own (the account Avatar).
 * `active` marks the place you are in (the open space, Settings) with an ink/50 ring.
 */
const railButtonVariants = cva(
  "flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-black-900",
  {
    variants: {
      look: {
        solid: "bg-black-800 hover:bg-black-700",
        dashed: "border border-dashed border-ink/30 text-fg-subtle hover:border-ink/50 hover:text-fg-muted",
        avatar: "font-sans text-xs font-normal transition-all",
        bare: "",
      },
      active: { true: "ring-2 ring-ink/50", false: "" },
    },
    compoundVariants: [
      { look: "solid", active: true, class: "bg-black-700" },
      { look: "avatar", active: false, class: "hover:brightness-125" },
    ],
    defaultVariants: { look: "solid", active: false },
  },
)

export interface RailButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof railButtonVariants> {}

const RailButton = React.forwardRef<HTMLButtonElement, RailButtonProps>(({ className, look, active, ...props }, ref) => (
  <button ref={ref} type="button" className={cn(railButtonVariants({ look, active }), className)} {...props} />
))
RailButton.displayName = "RailButton"

export { RailButton, railButtonVariants }
