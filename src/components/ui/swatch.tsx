import * as React from "react"

import { cn } from "~src/lib/utils"

/**
 * A colour to pick (TASK-103.4): the accent hue presets and a space's colour. A 16px dot filled with
 * `color`; the chosen one gets a 2px ink/70 ring and grows a little, and it says so to assistive tech
 * (aria-pressed). `label` names the colour ("Blue"), since the dot alone has no text.
 */
export interface SwatchProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "color"> {
  color: string
  label: string
  selected: boolean
}

const Swatch = React.forwardRef<HTMLButtonElement, SwatchProps>(({ color, label, selected, className, style, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    aria-label={label}
    aria-pressed={selected}
    className={cn(
      "h-4 w-4 shrink-0 rounded-full border-2 outline-none transition-all focus-visible:ring-1 focus-visible:ring-ring",
      selected ? "scale-110 border-ink/70" : "border-transparent hover:border-ink/30",
      className,
    )}
    style={{ ...style, backgroundColor: color }}
    {...props}
  />
))
Swatch.displayName = "Swatch"

export { Swatch }
