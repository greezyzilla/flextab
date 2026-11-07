import * as React from "react"
import * as TogglePrimitive from "@radix-ui/react-toggle"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "~src/lib/utils"

const toggleVariants = cva(
  "inline-flex items-center justify-center gap-1.5 rounded-lg font-sans text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-transparent text-fg-subtle hover:bg-ink/[0.05] hover:text-fg-muted data-[state=on]:bg-[var(--accent-subtle)] data-[state=on]:text-fg",
        outline:
          "border border-ink/[0.06] bg-ink/[0.03] text-fg-subtle shadow-sm hover:border-ink/15 hover:text-fg-muted data-[state=on]:border-[var(--accent)] data-[state=on]:bg-[var(--accent-subtle)] data-[state=on]:text-fg",
      },
      size: {
        default: "h-9 px-2.5 min-w-9",
        sm: "h-8 px-3 min-w-8",
        lg: "h-10 px-3 min-w-10",
      },
    },
    defaultVariants: {
      variant: "outline",
      size: "sm",
    },
  }
)

const Toggle = React.forwardRef<
  React.ElementRef<typeof TogglePrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof TogglePrimitive.Root> &
    VariantProps<typeof toggleVariants>
>(({ className, variant, size, ...props }, ref) => (
  <TogglePrimitive.Root
    ref={ref}
    className={cn(toggleVariants({ variant, size, className }))}
    {...props}
  />
))

Toggle.displayName = TogglePrimitive.Root.displayName

export { Toggle, toggleVariants }
