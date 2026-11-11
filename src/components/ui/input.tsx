import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "~src/lib/utils"

const inputVariants = cva("flex w-full font-sans outline-none disabled:cursor-not-allowed disabled:opacity-50", {
  variants: {
    variant: {
      // form field
      default:
        "h-9 rounded-lg border border-input bg-ink/[0.06] px-3 py-1 text-sm text-fg shadow-sm transition-colors placeholder:text-fg-subtle focus-visible:border-ink/70",
      // Inline create / rename (TASK-62): bare text that sits exactly where the
      // row's label sits. The row around it draws the field (`inlineEditFrame`),
      // so the field adds no padding, height or accent of its own. Font size and
      // weight come from the call site, matching the label it replaces.
      inline:
        "h-auto min-w-0 border-0 bg-transparent p-0 text-fg shadow-none placeholder:text-fg-subtle",
    },
  },
  defaultVariants: { variant: "default" },
})

/**
 * The row that holds an inline field, drawn like the approved header search
 * field: a faint fill and a 1px neutral edge that firms up on focus, never the
 * accent (a red accent ring around an empty field reads as an error). An
 * inset outline, not a border, so the row keeps its exact size and the text
 * stays in the label column; outlines also survive forced-colors mode.
 */
export const inlineEditFrame =
  "rounded-md bg-ink/5 outline outline-1 -outline-offset-1 outline-ink/10 focus-within:outline-ink/30"

/** Read to screen readers in place of the old visible "Enter to create · Esc to cancel" line. */
export const INLINE_CREATE_HINT = "Enter to create, Escape to cancel"

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
