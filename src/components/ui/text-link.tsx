import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "~src/lib/utils"

/**
 * An action set as underlined text (TASK-103.4): "Forgot password?", "Back to sign in", a modal
 * footer's "Download backup". The underline shows at rest, so it reads as something to press, and
 * hovering firms the text to fg. By default it takes the size and colour of the sentence it sits in;
 * `tone` and `size` set them when it stands alone. For an accent action, use Button variant="link".
 */
const textLinkVariants = cva(
  "rounded outline-none transition-colors hover:text-fg focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50",
  {
    variants: {
      tone: {
        inherit: "",
        muted: "text-fg-muted",
        subtle: "text-fg-subtle",
        // Inside an error message: stays red, firms to the stronger red on hover.
        danger: "text-danger hover:text-danger-strong",
      },
      size: {
        inherit: "",
        // Beside a field label (the 11px caption).
        caption: "text-caption",
        // 11px in the line height around it (a list's "+3 more").
        "2xs": "text-caption",
        xs: "text-xs",
        sm: "text-sm",
      },
      // Without the underline it is text you can press in place: a group's name (renames it),
      // "+3 more". It still firms on hover and takes the focus ring.
      underline: { true: "underline underline-offset-4", false: "" },
      // A name that may be long: one line, cut with an ellipsis at its container's edge.
      truncate: { true: "block max-w-full truncate text-left", false: "" },
    },
    defaultVariants: { tone: "inherit", size: "inherit", underline: true, truncate: false },
  },
)

export interface TextLinkProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof textLinkVariants> {}

const TextLink = React.forwardRef<HTMLButtonElement, TextLinkProps>(({ className, tone, size, underline, truncate, ...props }, ref) => (
  <button ref={ref} type="button" className={cn(textLinkVariants({ tone, size, underline, truncate }), className)} {...props} />
))
TextLink.displayName = "TextLink"

export { TextLink, textLinkVariants }
