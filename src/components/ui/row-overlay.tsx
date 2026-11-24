import * as React from "react"

import { cn } from "~src/lib/utils"

/**
 * A row's main action spread over the whole row (Opened tabs' "Go to"), the stretched
 * link pattern: an empty button covering its `relative` parent, under the row's own controls (give
 * those `relative z-10`) and its text (pointer-events-none). It needs an aria-label, since it has
 * no text; its focus ring traces the row's rounded box.
 */
export interface RowOverlayProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  "aria-label": string
}

const RowOverlay = React.forwardRef<HTMLButtonElement, RowOverlayProps>(({ className, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    className={cn("absolute inset-0 rounded-md cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-ring", className)}
    {...props}
  />
))
RowOverlay.displayName = "RowOverlay"

export { RowOverlay }
