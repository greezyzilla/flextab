import * as React from "react"
import { cva } from "class-variance-authority"

import { cn } from "~src/lib/utils"

/**
 * The clickable label of a sidebar tree row (TASK-103.4): the level's icon, then the name. The row
 * around it owns the fill, the text colour and the keyboard focus ring (TREE_ROW_FOCUS, TASK-120):
 * the ring is the row's own box, ⋯ included, not the label's. This is the label's box and type.
 *   project  — a top-level row: the panel's label box, name 13px medium (the Settings nav shares
 *              these through panelChrome's PANEL_ROW_LABEL and PANEL_ROW_TEXT).
 *   category — a nested row: indented past the project's chevron column, name 13px regular.
 * Pass the icon (or its drag handle) as `icon` and the name as children.
 */

/** The top-level label's box, without a focus ring of its own. */
const TREE_LABEL_BOX = "flex items-center gap-2 py-1.5 text-left rounded outline-none"

/** The top-level label's box, shared with the Settings nav's links (which draw their ring on the link). */
export const TREE_ROW_LABEL = `${TREE_LABEL_BOX} focus-visible:ring-1 focus-visible:ring-ring`

/** On a tree row: its ring while its label has keyboard focus, so the ring is the row's own box (TASK-120). */
export const TREE_ROW_FOCUS = "has-[[data-tree-row]:focus-visible]:ring-1 has-[[data-tree-row]:focus-visible]:ring-ring"

/** The top-level row's name, shared with the Settings nav's links. */
export const TREE_ROW_TEXT = "font-sans text-item font-medium truncate"

const treeRowVariants = cva("", {
  variants: {
    level: {
      project: TREE_LABEL_BOX,
      category: "flex items-center gap-2 pl-7 pr-1 py-1.5 rounded-md text-left outline-none",
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
  <button ref={ref} type="button" className={cn(treeRowVariants({ level }), className)} {...props}>
    {icon}
    <span className={NAME[level]}>{children}</span>
  </button>
))
TreeRowButton.displayName = "TreeRowButton"

export { TreeRowButton }
