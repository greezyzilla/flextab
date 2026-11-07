import { Fragment, useRef, useState, type ReactNode } from "react"
import { MoreHorizontal } from "lucide-react"
import { IconButton } from "./button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "./dropdown-menu"

export type RowAction = {
  label: string
  onSelect: () => void
  danger?: boolean
  separatorBefore?: boolean
  /** The action moves focus itself (e.g. an inline rename input): don't send it back to "⋯". */
  takesFocus?: boolean
}

/**
 * The one trailing slot every row owns (TASK-5). Its width is fixed, so the
 * slots of a panel form one column, and header controls sit in the same
 * column by using it too. Nothing else in a row reserves room for actions.
 */
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
export function RowActions({ label, items, reveal = "", conceal = "", rest, note, onOpenChange }: {
  label: string
  items: RowAction[]
  reveal?: string
  conceal?: string
  rest?: ReactNode
  note?: string
  onOpenChange?: (open: boolean) => void
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
              title={label}
              onClick={(e) => e.stopPropagation()}
              className={`absolute inset-0 ${open ? "opacity-100 bg-white/10 text-fg" : reveal}`}
            >
              <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
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
                <DropdownMenuItem
                  onSelect={() => { if (item.takesFocus) afterClose.current = item.onSelect; else item.onSelect() }}
                  className={item.danger ? "text-red-400 focus:bg-red-400/10 focus:text-red-400" : undefined}
                >
                  {item.label}
                </DropdownMenuItem>
              </Fragment>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </ActionSlot>
  )
}
