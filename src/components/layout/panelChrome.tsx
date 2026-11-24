import config from "../../../package.json"
import type { ReactNode } from "react"
import { Kbd } from "~src/components/ui/kbd"
import { useUIStore } from "~src/store/useUIStore"
import { Button } from "~src/components/ui/button"
import { TREE_LABEL_BOX, TREE_ROW_FOCUS, TREE_ROW_TEXT } from "~src/components/ui/tree-row-button"
import { TREE_HEADER_END, TREE_ROW_END } from "~src/components/ui/row-actions"

/**
 * The left panel's frame: the workspace tree (LeftPanel) and the
 * Settings nav share these, so switching between them moves nothing. The
 * workspace panel is the reference.
 */

/** Title row. Its end padding (TREE_HEADER_END) keeps a trailing ⋯ in the rows' trailing slot column. */
export const PANEL_HEADER = `h-16 flex items-end justify-between gap-2 pl-4 ${TREE_HEADER_END} pb-4 border-b border-line`

/** The panel's title text. */
export const PANEL_TITLE = "min-w-0 truncate text-fg font-sans text-2xl"

/** The scrolling list under the title. */
export const PANEL_LIST = "flex-1 overflow-y-auto py-4"

/** A row's end padding: its trailing ⋯ sits as far from the end as its chevron from the start. */
export const PANEL_ROW_END = TREE_ROW_END

/** A top-level row's box: inset from the panel edge, rounded like every row. */
export const PANEL_ROW = `mx-2 pl-1 ${PANEL_ROW_END} rounded-md transition-colors`

/** The clickable label inside a row: icon, then the name. The tree's TreeRowButton draws its own. */
export const PANEL_ROW_LABEL = TREE_LABEL_BOX

/** On a row: its focus ring is the row's own box while its label (data-row-label) has keyboard focus. */
export const PANEL_ROW_FOCUS = TREE_ROW_FOCUS

/** A row's name: 13px, medium for a top-level row. */
export const PANEL_ROW_TEXT = TREE_ROW_TEXT

/**
 * The panel's footer, one component for both panels. It is layout, so it is the
 * same on every page: the version in the left slot, Shortcuts in the
 * right slot.
 */
export function PanelFooter({ start }: { start?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 px-4 py-2 border-t border-line">
      <div className="min-w-0 text-caption font-sans text-fg-subtle">{start}</div>
      {/* The one visible way in to every shortcut. */}
      <Button variant="quiet" size="footer" className="shrink-0" onClick={() => useUIStore.getState().setShortcutsOpen(true)}>
        Shortcuts
        <Kbd shortcut="?" />
      </Button>
    </div>
  )
}

/**
 * The version people see: the manifest's version_name when the build has one (a
 * beta build reads "0.1.0 Beta 7"), else its version. Outside the
 * extension (tests) it falls back to package.json.
 */
function versionText(): string {
  const manifest = typeof chrome !== "undefined" ? chrome.runtime?.getManifest?.() : undefined
  return manifest?.version_name || manifest?.version || config.version || "0.0.1"
}

/** "FlexTab v0.1.0", for the footer's left slot in the workspace and Settings. */
export function AppVersion() {
  return <>FlexTab v{versionText()}</>
}
