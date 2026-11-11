import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "~src/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // brand primary — gradient derived from --accent (see .accent-fill)
        default: "accent-fill",
        // The final confirm of a destructive action (in a modal footer): solid red, flat.
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        // A page control that opens a destructive flow ("Delete space…"). Its shape, not
        // only its hue, sets it apart from the accent fill, so it still reads as danger
        // when the accent itself is red (TASK-49).
        danger:
          "border border-danger/35 bg-danger/[0.08] text-danger hover:border-danger/55 hover:bg-danger/[0.14]",
        outline:
          // Own text colour: dialogs render in a portal, where inherited colour is the browser's black.
          "border border-input bg-background text-fg-muted shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-ink/[0.08] text-fg hover:bg-ink/[0.13]",
        ghost:
          "border border-ink/10 text-fg-muted hover:border-ink/25 hover:bg-ink/[0.04] hover:text-ink",
        link: "text-fg-subtle underline-offset-4 hover:text-ink hover:underline",
      },
      size: {
        default: "h-9 px-3.5 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    )
  },
)
Button.displayName = "Button"

/**
 * Square icon button — project helper (shadcn has no IconButton; canonical uses
 * <Button size="icon">, but we want hover-only "subtle" + danger tones too).
 *   default — hover background; subtle — hover color only, no background.
 */
const iconButtonVariants = cva(
  "inline-flex items-center justify-center rounded-md p-1.5 outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring",
  {
    variants: {
      variant: {
        default: "text-fg-subtle hover:bg-ink/10 hover:text-fg",
        subtle: "text-fg-subtle hover:text-fg-muted",
      },
      danger: { true: "", false: "" },
    },
    compoundVariants: [
      { variant: "default", danger: true, class: "text-fg-subtle hover:bg-red-400/10 hover:text-danger" },
      { variant: "subtle", danger: true, class: "text-fg-subtle hover:text-danger" },
    ],
    defaultVariants: { variant: "default", danger: false },
  },
)

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof iconButtonVariants> {
  asChild?: boolean
  /**
   * What the button does, shown in the app Tooltip (TASK-53: icon buttons never
   * use a native `title`). Short, without the object ("More actions"); the
   * `aria-label` stays the full name ("Actions for Launch").
   */
  tooltip?: React.ReactNode
  tooltipSide?: React.ComponentPropsWithoutRef<typeof TooltipContent>["side"]
}

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant, danger, asChild = false, tooltip, tooltipSide, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    const button = <Comp className={cn(iconButtonVariants({ variant, danger }), className)} ref={ref} {...props} />
    if (tooltip == null) return button
    return <IconTooltip content={tooltip} side={tooltipSide}>{button}</IconTooltip>
  },
)
IconButton.displayName = "IconButton"

function isFocusVisible(el: Element): boolean {
  try { return el.matches(":focus-visible") } catch { return true }
}

/**
 * The app Tooltip, opened by hover or by keyboard focus only. A menu that
 * closes hands focus back to its trigger; after a mouse close that focus is not
 * :focus-visible and must not pop the tooltip up under the pointer's old spot.
 */
function IconTooltip({ content, side, children }: { content: React.ReactNode; side?: IconButtonProps["tooltipSide"]; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  const quiet = React.useRef(false)
  return (
    <Tooltip open={open} onOpenChange={(next) => setOpen(next && !quiet.current)}>
      <TooltipTrigger
        asChild
        onFocus={(e) => { quiet.current = !isFocusVisible(e.currentTarget) }}
        onPointerMove={() => { quiet.current = false }}
        onBlur={() => { quiet.current = false }}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side={side}>{content}</TooltipContent>
    </Tooltip>
  )
}

export { Button, IconButton, buttonVariants }
