import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "~src/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // brand primary — gradient derived from --accent (see .accent-fill)
        default: "accent-fill",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-white/[0.08] text-fg hover:bg-white/[0.13]",
        ghost:
          "border border-white/10 text-fg-muted hover:border-white/25 hover:bg-white/[0.04] hover:text-white",
        link: "text-fg-subtle underline-offset-4 hover:text-white hover:underline",
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
        default: "text-fg-subtle hover:bg-white/10 hover:text-fg",
        subtle: "text-fg-subtle hover:text-fg-muted",
      },
      danger: { true: "", false: "" },
    },
    compoundVariants: [
      { variant: "default", danger: true, class: "text-fg-subtle hover:bg-red-400/10 hover:text-red-400" },
      { variant: "subtle", danger: true, class: "text-fg-subtle hover:text-red-400" },
    ],
    defaultVariants: { variant: "default", danger: false },
  },
)

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof iconButtonVariants> {
  asChild?: boolean
}

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant, danger, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp className={cn(iconButtonVariants({ variant, danger }), className)} ref={ref} {...props} />
    )
  },
)
IconButton.displayName = "IconButton"

export { Button, IconButton, buttonVariants }
