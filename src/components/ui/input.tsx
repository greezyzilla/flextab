import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "~src/lib/utils"

const inputVariants = cva("flex w-full font-sans outline-none disabled:cursor-not-allowed disabled:opacity-50", {
  variants: {
    variant: {
      // form field
      default:
        "h-9 rounded-lg border border-input bg-ink/[0.06] px-3 py-1 text-sm text-fg shadow-sm transition-colors placeholder:text-fg-subtle focus-visible:border-ink/70",
      // inline rename
      inline:
        "rounded bg-ink/10 px-2 py-0.5 text-sm text-fg min-w-0 placeholder:text-fg-subtle focus:ring-1 focus:ring-[var(--accent)]",
    },
  },
  defaultVariants: { variant: "default" },
})

export interface InputProps
  extends React.ComponentProps<"input">,
    VariantProps<typeof inputVariants> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, variant, type, ...props }, ref) => (
    <input type={type} ref={ref} className={cn(inputVariants({ variant }), className)} {...props} />
  ),
)
Input.displayName = "Input"

export { Input }
