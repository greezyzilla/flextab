import * as React from "react"
import { cva } from "class-variance-authority"

import { cn } from "~src/lib/utils"

/**
 * The clickable label of a sidebar tree row: the level's icon, then the name. The row
 * around it owns the fill, the text colour and the keyboard focus ring (TREE_ROW_FOCUS):
 * the ring is the row's own box, ⋯ included, not the label's. This is the label's box and type.
 *   project  — a top-level row: the panel's label box, name 13px medium (the Settings nav shares
 *              these through panelChrome's PANEL_ROW_LABEL and PANEL_ROW_TEXT).
 *   category — a nested row: indented past the project's chevron column, name 13px regular.
 * Pass the icon (or its drag handle) as `icon` and the name as children.
 */

/**
 * A list row's vertical padding outside the cards (sidebar tree, Settings nav, Opened Tabs): it
 * follows Settings › Appearance › Density. Comfortable is py-1.5; the fallback keeps that
 * where no density class is set.
 */
export const DENSITY_ROW_PY = "py-[var(--density-py-row,0.375rem)]"

/** The top-level label's box, shared with the Settings nav's links; no focus ring of its own. */
export const TREE_LABEL_BOX = `flex items-center gap-2 ${DENSITY_ROW_PY} text-left rounded outline-none`

/**
 * On a row: its ring while its label (marked data-row-label) has keyboard focus, so the ring is the
 * row's own box, its other controls included (tree rows, the Settings nav).
 */
export const TREE_ROW_FOCUS = "has-[[data-row-label]:focus-visible]:ring-1 has-[[data-row-label]:focus-visible]:ring-ring"

/** The top-level row's name, shared with the Settings nav's links. */
export const TREE_ROW_TEXT = "font-sans text-item font-medium truncate"

const treeRowVariants = cva("", {
  variants: {
    level: {
      project: TREE_LABEL_BOX,
      category: `flex items-center gap-2 pl-7 pr-1 ${DENSITY_ROW_PY} rounded-md text-left outline-none`,
    },
  },
})

const NAME = {
  project: `flex-1 ${TREE_ROW_TEXT}`,
  category: "flex-1 font-sans text-item truncate",
} as const

export interface TreeRowButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  level: "project" | "category"
  icon: React.ReactNode
}

const TreeRowButton = React.forwardRef<HTMLButtonElement, TreeRowButtonProps>(({ level, icon, className, children, ...props }, ref) => (
  <button ref={ref} type="button" data-row-label="" className={cn(treeRowVariants({ level }), className)} {...props}>
    {icon}
    <span className={NAME[level]}>{children}</span>
  </button>
))
TreeRowButton.displayName = "TreeRowButton"

export { TreeRowButton }
