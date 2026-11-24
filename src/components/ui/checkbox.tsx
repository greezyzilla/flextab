import * as React from "react"

import { cn } from "~src/lib/utils"

/**
 * A checkbox (TASK-103.3). The browser's own control in the accent colour, so it keeps native
 * keyboard, form and forced-colours behaviour. The only place the app renders a checkbox input;
 * in a modal, use ModalCheckbox for the label and spacing.
 */
const Checkbox = React.forwardRef<HTMLInputElement, Omit<React.ComponentProps<"input">, "type">>(
  ({ className, ...props }, ref) => (
    <input ref={ref} type="checkbox" className={cn("m-0 shrink-0 accent-[var(--accent)] disabled:cursor-not-allowed", className)} {...props} />
  ),
)
Checkbox.displayName = "Checkbox"

export { Checkbox }
