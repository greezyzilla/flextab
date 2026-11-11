import * as React from "react"
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group"
import { type VariantProps } from "class-variance-authority"

import { cn } from "~src/lib/utils"
import { toggleVariants } from "~src/components/ui/toggle"
import { IconTooltip } from "~src/components/ui/button"

const ToggleGroupContext = React.createContext<
  VariantProps<typeof toggleVariants>
>({
  size: "default",
  variant: "default",
})

const ToggleGroup = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Root> &
    VariantProps<typeof toggleVariants>
>(({ className, variant, size, children, ...props }, ref) => (
  <ToggleGroupPrimitive.Root
    ref={ref}
    className={cn(
      "flex items-center justify-center gap-1",
      // The segmented tray shares the toolbar's edge logic with Button ghost sm
      // (TASK-61): 32px tall, 6px radius, ink/10 border, no fill.
      variant === "segmented" && "h-8 gap-0.5 rounded-md border border-ink/10 p-0.5",
      className,
    )}
    {...props}
  >
    <ToggleGroupContext.Provider value={{ variant, size }}>
      {children}
    </ToggleGroupContext.Provider>
  </ToggleGroupPrimitive.Root>
))

ToggleGroup.displayName = ToggleGroupPrimitive.Root.displayName

const ToggleGroupItem = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item> &
    VariantProps<typeof toggleVariants> & {
      /** App Tooltip for an icon-only item (TASK-61), as IconButton's `tooltip`. */
      tooltip?: React.ReactNode
      tooltipSide?: React.ComponentPropsWithoutRef<typeof IconTooltip>["side"]
    }
>(({ className, children, variant, size, tooltip, tooltipSide, ...props }, ref) => {
  const context = React.useContext(ToggleGroupContext)
  const classes = cn(
    toggleVariants({
      variant: context.variant || variant,
      size: context.size || size,
    }),
    className
  )

  if (tooltip == null) {
    return (
      <ToggleGroupPrimitive.Item ref={ref} className={classes} {...props}>
        {children}
      </ToggleGroupPrimitive.Item>
    )
  }
  // The item wraps the tooltip, not the other way round: both set data-state on
  // the same button and the outer one's props win, so the item's "on"/"off"
  // must be the outer one or the pressed style never shows.
  return (
    <ToggleGroupPrimitive.Item ref={ref} className={classes} {...props} asChild>
      <IconTooltip content={tooltip} side={tooltipSide}>
        <button type="button">{children}</button>
      </IconTooltip>
    </ToggleGroupPrimitive.Item>
  )
})

ToggleGroupItem.displayName = ToggleGroupPrimitive.Item.displayName

export { ToggleGroup, ToggleGroupItem }
