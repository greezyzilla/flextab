import * as React from "react"
import { cva } from "class-variance-authority"

import { cn } from "~src/lib/utils"

/**
 * The clickable label of a sidebar tree row (TASK-103.4): the level's icon, then the name. The row
 * around it owns the fill and the text colour; this is the label's box, focus ring and type.
 *   project  — a top-level row: the panel's label box, name 13px medium (the Settings nav shares
 *              these through panelChrome's PANEL_ROW_LABEL and PANEL_ROW_TEXT).
 *   category — a nested row: indented past the project's chevron column, name 13px regular.
 * Pass the icon (or its drag handle) as `icon` and the name as children.
 */

/** The top-level label's box, shared with the Settings nav's links. */
export const TREE_ROW_LABEL = "flex items-center gap-2 py-1.5 text-left rounded outline-none focus-visible:ring-1 focus-visible:ring-ring"

/** The top-level row's name, shared with the Settings nav's links. */
export const TREE_ROW_TEXT = "font-sans text-[13px] font-medium truncate"

const treeRowVariants = cva("", {
  variants: {
    level: {
      project: TREE_ROW_LABEL,
      category: "flex items-center gap-2 pl-7 pr-1 py-[6px] rounded-md text-left outline-none focus-visible:ring-1 focus-visible:ring-ring",
    },
  },
})

const NAME = {
  project: `flex-1 ${TREE_ROW_TEXT}`,
  category: "flex-1 font-sans text-[13px] truncate",
} as const

export interface TreeRowButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  level: "project" | "category"
  icon: React.ReactNode
}

const TreeRowButton = React.forwardRef<HTMLButtonElement, TreeRowButtonProps>(({ level, icon, className, children, ...props }, ref) => (
  <button ref={ref} type="button" className={cn(treeRowVariants({ level }), className)} {...props}>
    {icon}
    <span className={NAME[level]}>{children}</span>
  </button>
))
TreeRowButton.displayName = "TreeRowButton"

export { TreeRowButton }
