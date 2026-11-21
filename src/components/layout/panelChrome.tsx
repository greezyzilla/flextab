import config from "../../../package.json"
import type { ReactNode } from "react"
import { Kbd } from "~src/components/ui/kbd"
import { useUIStore } from "~src/store/useUIStore"

/**
 * The left panel's frame (TASK-84): the workspace tree (LeftPanel) and the
 * Settings nav share these, so switching between them moves nothing. The
 * workspace panel is the reference.
 */

/** Title row. pr-3 keeps a trailing ⋯ in the rows' trailing slot column. */
export const PANEL_HEADER = "h-16 flex items-end justify-between gap-2 pl-4 pr-3 pb-4 border-b border-line"

/** The panel's title text. */
export const PANEL_TITLE = "min-w-0 truncate text-fg font-sans text-2xl"

/** The scrolling list under the title. */
export const PANEL_LIST = "flex-1 overflow-y-auto py-4"

/** A top-level row's box: inset from the panel edge, rounded like every row. */
export const PANEL_ROW = "mx-2 pl-1 pr-1 rounded-md transition-colors"

/** The clickable label inside a row: icon, then the name. */
export const PANEL_ROW_LABEL = "flex items-center gap-2 py-1.5 text-left rounded outline-none focus-visible:ring-1 focus-visible:ring-ring"

/** A row's name: 13px, medium for a top-level row. */
export const PANEL_ROW_TEXT = "font-sans text-[13px] font-medium truncate"

/**
 * The panel's footer, one component for both panels: Shortcuts always in the
 * right slot; Settings puts the version in the left slot.
 */
export function PanelFooter({ start }: { start?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 px-4 py-2 border-t border-line">
      <div className="min-w-0 text-[11px] font-sans text-fg-subtle">{start}</div>
      {/* The one visible way in to every shortcut (TASK-13). */}
      <button
        type="button"
        onClick={() => useUIStore.getState().setShortcutsOpen(true)}
        className="flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px] font-sans text-fg-subtle outline-none transition-colors hover:bg-ink/[0.06] hover:text-fg focus-visible:ring-1 focus-visible:ring-ring"
      >
        Shortcuts
        <Kbd shortcut="?" />
      </button>
    </div>
  )
}

/** "FlexTab v0.1.0", for the Settings footer's left slot (TASK-15). */
export function AppVersion() {
  return <>FlexTab v{config.version || "0.0.1"}</>
}
