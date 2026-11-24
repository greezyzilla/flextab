import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "~src/lib/utils"

/**
 * A chip: a small rounded button that picks one of a few (Recent places, "Which saved
 * episode?") or starts something (the empty workspace's starters). Pass `selected` when it picks:
 * it then says so to assistive tech (aria-pressed) and the chosen one is drawn per surface:
 *   dialog — an edged chip, the chosen one in the accent (12px).
 *   panel  — the popup's filled chip, 36px; the chosen one firmer, with an inset ink ring, so it
 *            reads without colour (one look for every panel chip). Choosing never changes the weight,
 *            so a chip keeps its width and the chips beside it stay put.
 *   pill   — a round, edged starter with room for an avatar on the left (13px); it acts, not picks.
 * `fullWidth` fills a grid cell and centres its text.
 */
const chipVariants = cva("flex max-w-full items-center outline-none transition-colors disabled:opacity-50", {
  variants: {
    size: {
      dialog: "gap-1.5 rounded-md border px-2 py-1 text-xs focus-visible:ring-1 focus-visible:ring-ring",
      panel: "h-9 gap-2 rounded-popup-item px-2.5 text-popup text-fg focus-visible:ring-2 focus-visible:ring-ring",
      pill: "gap-2 rounded-full border border-ink/10 bg-ink/[0.04] py-1 pl-1 pr-3 font-sans text-item text-fg hover:bg-ink/[0.08] focus-visible:ring-2 focus-visible:ring-ring",
    },
    selected: { true: "", false: "" },
    fullWidth: { true: "w-full justify-center", false: "" },
  },
  compoundVariants: [
    { size: "dialog", selected: false, class: "border-ink/10 text-fg-muted hover:bg-ink/[0.05]" },
    { size: "dialog", selected: true, class: "border-[var(--accent)] bg-[var(--accent-subtle)] text-fg" },
    { size: "panel", selected: false, class: "bg-ink/[0.06] hover:bg-ink/[0.1]" },
    { size: "panel", selected: true, class: "bg-ink/[0.14] ring-1 ring-inset ring-ink/[0.24]" },
  ],
  defaultVariants: { size: "dialog", fullWidth: false },
})

export interface ChipProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "aria-pressed">, Omit<VariantProps<typeof chipVariants>, "selected"> {
  /** Set when the chip picks one of several; leave out for a chip that acts. */
  selected?: boolean
}

const Chip = React.forwardRef<HTMLButtonElement, ChipProps>(({ className, size, selected, fullWidth, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    aria-pressed={selected}
    className={cn(chipVariants({ size, selected: selected ?? false, fullWidth }), className)}
    {...props}
  />
))
Chip.displayName = "Chip"

export { Chip, chipVariants }
