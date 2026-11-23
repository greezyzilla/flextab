import { Fragment, useRef, useState, type ReactNode } from "react"
import { Icon } from "~src/components/ui/icon"
import { MoreHorizontal } from "lucide-react"
import { IconButton } from "./button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "./dropdown-menu"

export type RowAction = {
  label: string
  onSelect: () => void
  danger?: boolean
  separatorBefore?: boolean
  /** The action moves focus itself (e.g. an inline rename input): don't send it back to "⋯". */
  takesFocus?: boolean
  /** Shown but not choosable (e.g. "Move up" on the first row), so the menu keeps one shape. */
  disabled?: boolean
  /** Opens a submenu with these items instead of running `onSelect` (e.g. a group's Colour). */
  sub?: ReactNode
}

/**
 * The one trailing slot every row owns (TASK-5). Its width is fixed, so the
 * slots of a panel form one column, and header controls sit in the same
 * column by using it too. Nothing else in a row reserves room for actions.
 */
/*
 * End paddings that keep a row symmetric around this 26px slot: the slot's
 * glyph sits as far from the row's end as the leading glyph from its start.
 * calc keeps it exact at every UI scale (rem scales, the slot does not).
 */

/** A content row (group header, saved-tab card): leading mark in a 1.25rem slot, inset by
 *  --density-px-tab; the end is trimmed by half the slot difference (3px at 100%). */
export const ACTION_ROW_END_PAD = "calc(var(--density-px-tab) - (26px - 1.25rem) / 2)"

/** A sidebar tree row: a 12px chevron in a 1.25rem column after pl-1, a 14px glyph in the
 *  slot (2px at 100%). */
export const TREE_ROW_END = "pr-[calc((1.875rem_-_26px)_/_2)]"

/** The sidebar title row: the rows' mx-2 plus TREE_ROW_END, so its ⋯ stays in the rows'
 *  column and its glyph sits as far from the panel's edge as the title (pl-4). */
export const TREE_HEADER_END = "pr-[calc((2.875rem_-_26px)_/_2)]"

export function ActionSlot({ children }: { children?: ReactNode }) {
  return <span className="relative flex h-[26px] w-[26px] shrink-0 items-center justify-center">{children}</span>
}

/**
 * A row's trailing slot: at rest it shows the row's status (`rest`: a count,
 * a saved mark, or nothing), and on hover/focus the "⋯" actions menu takes
 * its place in the same spot, so nothing shifts. The menu is the row's one
 * place for its secondary actions, reachable by mouse and keyboard (the
 * sidebar tree has no right-click menu).
 *
 * `reveal` / `conceal` are the row's hover/focus classes for the "⋯" and for
 * the resting status (Tailwind needs the row's literal group name), e.g.
 * reveal="opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100"
 * conceal="group-hover/row:opacity-0 group-focus-within/row:opacity-0".
 * While the menu is open the "⋯" stays visible and shows as active.
 * `note` heads the menu with what the resting status means (e.g. where an
 * open tab is already saved), since the status hides once "⋯" shows.
 */
export function RowActions({ label, items, reveal = "", conceal = "", rest, note, onOpenChange, tooltipSide }: {
  label: string
  items: RowAction[]
  reveal?: string
  conceal?: string
  rest?: ReactNode
  note?: string
  onOpenChange?: (open: boolean) => void
  /** Same side as the row's other icon buttons' tooltips (the left panel opens them to the right). */
  tooltipSide?: "top" | "right" | "bottom" | "left"
}) {
  const [open, setOpen] = useState(false)
  // An action that moves focus itself (an inline rename input) runs only once
  // the menu has closed, instead of fighting the menu's focus return.
  const afterClose = useRef<(() => void) | null>(null)
  const change = (o: boolean) => { setOpen(o); onOpenChange?.(o) }
  // No actions, no "⋯" (an empty menu would be a dead end). The slot stays,
  // so the column still lines up.
  const hasMenu = items.length > 0
  return (
    <ActionSlot>
      {rest != null && (
        <span className={`flex items-center justify-center transition-opacity ${hasMenu ? (open ? "opacity-0" : conceal) : ""}`}>
          {rest}
        </span>
      )}
      {hasMenu && (
        <DropdownMenu open={open} onOpenChange={change}>
          <DropdownMenuTrigger asChild>
            <IconButton
              aria-label={label}
              tooltip="More actions"
              tooltipSide={tooltipSide}
              onClick={(e) => e.stopPropagation()}
              className={`absolute inset-0 ${open ? "opacity-100 bg-ink/10 text-fg" : reveal}`}
            >
              <Icon icon={MoreHorizontal} size="sm" />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onCloseAutoFocus={(e) => {
            const run = afterClose.current
            if (!run) return
            afterClose.current = null
            e.preventDefault()
            run()
          }}>
            {note && (
              <>
                <DropdownMenuLabel className="max-w-64 font-normal text-fg-subtle">{note}</DropdownMenuLabel>
                <DropdownMenuSeparator />
              </>
            )}
            {items.map((item) => (
              <Fragment key={item.label}>
                {item.separatorBefore && <DropdownMenuSeparator />}
                {item.sub ? (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>{item.label}</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>{item.sub}</DropdownMenuSubContent>
                  </DropdownMenuSub>
                ) : (
                  <DropdownMenuItem
                    disabled={item.disabled}
                    onSelect={() => { if (item.takesFocus) afterClose.current = item.onSelect; else item.onSelect() }}
                    className={item.danger ? "text-danger focus:bg-danger/10 focus:text-danger" : undefined}
                  >
                    {item.label}
                  </DropdownMenuItem>
                )}
              </Fragment>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </ActionSlot>
  )
}
