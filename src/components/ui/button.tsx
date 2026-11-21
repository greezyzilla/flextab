import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "~src/lib/utils"
import { hasClippedText } from "~src/lib/displayUrl"
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
          "bg-destructive text-destructive-foreground shadow-sm hover:brightness-90",
        // A page control that opens a destructive flow ("Delete space…"). Its shape, not
        // only its hue, sets it apart from the accent fill, so it still reads as danger
        // when the accent itself is red (TASK-49).
        danger:
          "border border-danger/70 bg-danger/[0.08] text-danger hover:border-danger/90 hover:bg-danger/[0.14]",
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
        // Beside a 44px field (Input variant "lg").
        xl: "h-11 rounded-md px-5 text-[15px]",
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
      { variant: "default", danger: true, class: "text-fg-subtle hover:bg-danger/10 hover:text-danger" },
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

export function isFocusVisible(el: Element): boolean {
  try { return el.matches(":focus-visible") } catch { return true }
}

/**
 * The app Tooltip, opened by hover or by keyboard focus only. A menu that
 * closes hands focus back to its trigger; after a mouse close that focus is not
 * :focus-visible and must not pop the tooltip up under the pointer's old spot.
 */
export const IconTooltip = React.forwardRef<
  HTMLButtonElement,
  Omit<React.ComponentPropsWithoutRef<typeof TooltipTrigger>, "content" | "asChild"> & {
    content: React.ReactNode
    side?: IconButtonProps["tooltipSide"]
    /** Asked each time the tooltip would open; false keeps it shut (e.g. only when text is cut, TASK-54). */
    when?: () => boolean
  }
>(({ content, side, when, children, onFocus, onPointerMove, onBlur, ...triggerProps }, ref) => {
  const [open, setOpen] = React.useState(false)
  const quiet = React.useRef(false)
  // Props from a control that wraps this one with asChild (e.g. a toggle's data-state="on")
  // land after the trigger's own data-state, so the control's state wins.
  return (
    <Tooltip open={open} onOpenChange={(next) => setOpen(next && !quiet.current && (when?.() ?? true))}>
      <TooltipTrigger
        asChild
        ref={ref}
        {...triggerProps}
        onFocus={(e) => { quiet.current = !isFocusVisible(e.currentTarget); onFocus?.(e) }}
        onPointerMove={(e) => { quiet.current = false; onPointerMove?.(e) }}
        onBlur={(e) => { quiet.current = false; onBlur?.(e) }}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side={side}>{content}</TooltipContent>
    </Tooltip>
  )
})
IconTooltip.displayName = "IconTooltip"

/**
 * The app Tooltip for text that may be cut (TASK-69): it opens only while the
 * trigger, or a `[data-clip]` inside it, is actually clipped, so a name that
 * fits never pops a copy of itself.
 */
export function ClippedTooltip({ content, side, children }: {
  content: React.ReactNode
  side?: IconButtonProps["tooltipSide"]
  children: React.ReactElement
}) {
  const ref = React.useRef<HTMLButtonElement>(null)
  const clipped = () => {
    const el = ref.current
    if (!el) return false
    return (el.hasAttribute("data-clip") && el.scrollWidth > el.clientWidth + 1) || hasClippedText(el)
  }
  return <IconTooltip ref={ref} content={content} side={side} when={clipped}>{children}</IconTooltip>
}

export { Button, IconButton, buttonVariants }
