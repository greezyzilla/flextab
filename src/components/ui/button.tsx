import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "~src/lib/utils"
import { hasClippedText } from "~src/lib/displayUrl"
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip"

// Forced colours (Windows contrast themes) drop backgrounds and shadows, so a filled variant with no
// border would be a bare label. It gets a 1px edge in a system colour there, drawn as an
// inset outline so the button keeps its size; normal colours never see it.
// Arbitrary properties: tailwind-merge (cn) drops `outline` next to `outline-1`, which left no edge.
const FORCED_EDGE = "forced-colors:[outline:1px_solid_ButtonText] forced-colors:[outline-offset:-1px] forced-colors:disabled:[outline-color:GrayText]"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // brand primary — gradient derived from --accent (see .accent-fill)
        default: `accent-fill ${FORCED_EDGE}`,
        // The final confirm of a destructive action (in a modal footer): solid red, flat.
        destructive:
          `bg-destructive text-destructive-foreground shadow-sm hover:brightness-90 ${FORCED_EDGE}`,
        // A page control that opens a destructive flow ("Delete space…"). Its shape, not
        // only its hue, sets it apart from the accent fill, so it still reads as danger
        // when the accent itself is red.
        danger:
          "border border-danger/70 bg-danger/[0.08] text-danger hover:border-danger/90 hover:bg-danger/[0.14]",
        outline:
          // Own text colour: dialogs render in a portal, where inherited colour is the browser's black.
          "border border-input bg-background text-fg-muted shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary: `bg-ink/[0.08] text-fg hover:bg-ink/[0.13] ${FORCED_EDGE}`,
        ghost:
          "border border-ink/10 text-fg-muted hover:border-ink/25 hover:bg-ink/[0.04] hover:text-ink",
        // An action set in text: accent text so it reads as something to press, at rest too.
        link: "text-fg-accent underline-offset-4 hover:underline",
        // App chrome (the header's "Sign in to sync", the sync status, the panel footer's Shortcuts):
        // regular weight, no edge, a faint fill and fg text on hover.
        quiet: "font-normal text-fg-muted hover:bg-ink/[0.06] hover:text-fg",
      },
      size: {
        default: "h-9 px-3.5 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        // A compact action inside a text-xs row (the conflict list's "Choose for all").
        xs: "h-7 rounded-md px-2.5 text-xs",
        // Beside a 44px field (Input variant "lg").
        xl: "h-11 rounded-md px-5 text-popup",
        icon: "h-9 w-9",
        // The app header's 36px row: a labelled action, or an icon-led status (tight).
        bar: "h-9 px-2.5 text-xs",
        "bar-tight": "h-9 gap-1.5 px-1.5 text-xs",
        // A panel footer's 11px row.
        footer: "gap-1.5 px-1.5 py-1 text-caption",
        // Inside a sentence (a notice's "Check again"): no box, the text's own size and line height.
        inline: "h-auto p-0 align-baseline text-[length:inherit] leading-[inherit]",
      },
      // Fills its container (a stacked column of actions). A prop, not a call-site class (docs/ui-layering.md).
      fullWidth: { true: "w-full", false: "" },
    },
    // Text set as an action lines up with the text around it, so a link never carries side padding.
    compoundVariants: [
      { variant: "link", class: "px-0" },
      // A footer is the quietest tier: its actions rest one step dimmer than the header's.
      { variant: "quiet", size: "footer", class: "text-fg-subtle" },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
      fullWidth: false,
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, fullWidth, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp className={cn(buttonVariants({ variant, size, fullWidth, className }))} ref={ref} {...props} />
    )
  },
)
Button.displayName = "Button"

/**
 * Square icon button — project helper (shadcn has no IconButton; canonical uses
 * <Button size="icon">, but we want hover-only "subtle" + danger tones too).
 *   default — hover background; subtle — hover colour only (to fg), no background.
 * A default icon button that opens a menu keeps the hover look while the menu is open: Radix sets
 * data-state="open" on the trigger, so no call site tracks it.
 */
const iconButtonVariants = cva(
  "inline-flex items-center justify-center rounded-md p-1.5 outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring",
  {
    variants: {
      variant: {
        default: "text-fg-subtle hover:bg-ink/10 hover:text-fg data-[state=open]:bg-ink/10 data-[state=open]:text-fg",
        // Hover firms to fg, not fg-muted: one step up from fg-subtle read as no change.
        subtle: "text-fg-subtle hover:text-fg",
      },
      danger: { true: "", false: "" },
      // sm: the 24px square inside a field (the search field's clear). lg: the 36px square of the
      // app header, beside the 36px search field.
      // xs: a 16px circle beside a label (a setting's info). disclosure: the sidebar's chevron column.
      size: { default: "", xs: "h-4 w-4 rounded-full p-0", sm: "h-6 w-6 p-1", disclosure: "h-6 w-5 rounded p-0", lg: "h-9 w-9" },
    },
    compoundVariants: [
      { variant: "default", danger: true, class: "text-fg-subtle hover:bg-danger/10 hover:text-danger" },
      { variant: "subtle", danger: true, class: "text-fg-subtle hover:text-danger" },
    ],
    defaultVariants: { variant: "default", danger: false, size: "default" },
  },
)

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof iconButtonVariants> {
  asChild?: boolean
  /**
   * What the button does, shown in the app Tooltip (icon buttons never
   * use a native `title`). Short, without the object ("More actions"); the
   * `aria-label` stays the full name ("Actions for Launch").
   */
  tooltip?: React.ReactNode
  tooltipSide?: React.ComponentPropsWithoutRef<typeof TooltipContent>["side"]
}

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant, danger, size, asChild = false, tooltip, tooltipSide, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    const button = <Comp className={cn(iconButtonVariants({ variant, danger, size }), className)} ref={ref} {...props} />
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
    /** Asked each time the tooltip would open; false keeps it shut (e.g. only when text is cut). */
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
 * The app Tooltip for text that may be cut: it opens only while the
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
