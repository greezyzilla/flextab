import * as React from "react"
import { ChevronRight } from "lucide-react"
import { cva, type VariantProps } from "class-variance-authority"

import { Icon } from "~src/components/ui/icon"
import { cn } from "~src/lib/utils"

/**
 * A button that opens and closes what follows it, with the chevron that turns as it does.
 *   panel  — a branch of the popup's destination tree: a 38px full-width row; `level` sets its type
 *            (space 13px subtle, project 15px medium, category 15px), and the chevron sits in the
 *            tree's 20px column.
 *   row    — a list row in a dialog (the sign-in choice's groups): full width, faint hover fill.
 *   inline — a sentence that opens detail ("3 other changes merged automatically").
 * `open` is announced (aria-expanded); the rest of the row is its children.
 */
const disclosureVariants = cva("outline-none", {
  variants: {
    size: {
      panel: "flex min-h-[38px] w-full min-w-0 items-center pr-3 text-left transition-colors hover:bg-ink/[0.04] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
      row: "flex w-full min-w-0 items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-ink/[0.04] focus-visible:ring-1 focus-visible:ring-ring",
      inline: "flex items-center gap-1.5 rounded text-xs text-fg-muted hover:text-fg focus-visible:ring-1 focus-visible:ring-ring",
    },
    level: {
      none: "",
      space: "text-popup-meta text-fg-subtle",
      project: "text-popup font-medium text-fg-muted",
      category: "text-popup text-fg-muted",
    },
  },
  defaultVariants: { size: "row", level: "none" },
})

export interface DisclosureProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "aria-expanded">, VariantProps<typeof disclosureVariants> {
  open: boolean
}

const Disclosure = React.forwardRef<HTMLButtonElement, DisclosureProps>(({ open, size, level, className, children, ...props }, ref) => {
  const turn = cn("transition-transform", open && "rotate-90")
  return (
    <button ref={ref} type="button" aria-expanded={open} className={cn(disclosureVariants({ size, level }), className)} {...props}>
      {size === "panel" ? (
        <span className="mr-1 flex w-5 shrink-0 justify-center text-fg-subtle" aria-hidden>
          <Icon icon={ChevronRight} size="md" className={turn} />
        </span>
      ) : (
        <Icon icon={ChevronRight} size="sm" className={cn(size === "inline" ? undefined : "text-fg-subtle", turn)} />
      )}
      {children}
    </button>
  )
})
Disclosure.displayName = "Disclosure"

export { Disclosure, disclosureVariants }
