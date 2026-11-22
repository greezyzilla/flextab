// A workspace tree inside a modal: spaces, then their groups as one path line, then tabs.
// Shared by the sign-in choice (both sides) and the version preview, so the same data looks the
// same in both places (modal standard §11).
import { useState, type ReactNode } from "react"
import { spaceTabCount } from "~src/services/spacesTree"
import type { SavedSpace, SavedTab } from "~src/types"
import { FaviconImg } from "~src/components/FaviconImg"
import { SpaceAvatar } from "~src/components/levelIcons"
import { cn } from "~src/lib/utils"
import { Disclosure as DisclosureButton } from "~src/components/ui/disclosure"
import { TextLink } from "~src/components/ui/text-link"

/** How many tabs a group shows before "+N more" (chunking keeps long lists scannable). */
const PREVIEW_TABS = 5
/** At or below this many tabs a side opens fully: a small set needs no overview step. */
const OPEN_ALL_AT = 15

export const tabCount = (spaces: SavedSpace[]) => spaces.reduce((sum, s) => sum + spaceTabCount(s), 0)
export const tabsLabel = (n: number) => `${n} tab${n === 1 ? "" : "s"}`
const groupsLabel = (n: number) => `${n} group${n === 1 ? "" : "s"}`

function groupsOf(space: SavedSpace): { id: string; path: string; tabs: SavedTab[] }[] {
  const out: { id: string; path: string; tabs: SavedTab[] }[] = []
  for (const p of space.projects || []) for (const c of p.categories || [])
    // Full path under the space: two categories may hold groups with the same name.
    for (const g of c.groups || []) if (g.tabs?.length) out.push({ id: g.id, path: `${p.name} › ${c.name} › ${g.name}`, tabs: g.tabs })
  return out
}

function hostOf(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, "") } catch { return url }
}

/** A disclosure row: one button that says what it opens and how much is inside. */
function Disclosure({ open, onToggle, label, children }: { open: boolean; onToggle: () => void; label: string; children: ReactNode }) {
  return <DisclosureButton size="row" open={open} aria-label={label} onClick={onToggle}>{children}</DisclosureButton>
}

function GroupBlock({ group, removed, defaultOpen }: { group: ReturnType<typeof groupsOf>[number]; removed: boolean; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const [all, setAll] = useState(false)
  const shown = all ? group.tabs : group.tabs.slice(0, PREVIEW_TABS)
  const strike = removed ? "text-fg-subtle line-through" : ""
  return (
    <li className="flex flex-col">
      <Disclosure open={open} onToggle={() => setOpen(o => !o)} label={`${group.path}, ${tabsLabel(group.tabs.length)}`}>
        <span className={cn("truncate text-xs", strike || "text-fg-muted")}>{group.path}</span>
        <span className="text-fg-subtle ml-auto shrink-0 text-[11px]">{group.tabs.length}</span>
      </Disclosure>
      {open && (
        <div className="flex flex-col gap-1 pb-1 pl-6">
          {/* Tab rows get pr-1 to match the disclosure rows' px-1: every count and host ends on one edge. */}
          <ul className="flex flex-col gap-1">
            {shown.map(t => (
              <li key={t.id} className="flex min-w-0 items-center gap-2 pr-1">
                <FaviconImg src={t.favicon} className={cn("h-3.5 w-3.5 shrink-0", removed && "grayscale opacity-60")} />
                <span className={cn("truncate text-xs", strike || "text-fg")}>{t.title || t.url}</span>
                <span className="text-fg-subtle ml-auto shrink-0 text-[11px]">{hostOf(t.url)}</span>
              </li>
            ))}
          </ul>
          {group.tabs.length > PREVIEW_TABS && (
            <TextLink tone="muted" size="2xs" underline={false} className="self-start" onClick={() => setAll(v => !v)}>
              {all ? "Show fewer" : `+${group.tabs.length - PREVIEW_TABS} more`}
            </TextLink>
          )}
        </div>
      )}
    </li>
  )
}

function SpaceBlock({ space, removed, inBoth, openAll }: { space: SavedSpace; removed: boolean; inBoth: boolean; openAll: boolean }) {
  const [open, setOpen] = useState(openAll)
  const groups = groupsOf(space)
  const tabs = spaceTabCount(space)
  return (
    <li className="flex flex-col">
      <Disclosure open={open} onToggle={() => setOpen(o => !o)} label={`${space.name}, ${groupsLabel(groups.length)}, ${tabsLabel(tabs)}${inBoth ? ", in both" : ""}`}>
        <SpaceAvatar space={space} size={18} active={!removed} />
        <span className={cn("truncate text-sm", removed ? "text-fg-subtle line-through" : "text-fg")}>{space.name}</span>
        {inBoth && <span className="shrink-0 rounded bg-ink/[0.08] px-1.5 py-0.5 text-[10px] font-medium text-fg-muted">In both</span>}
        <span className="text-fg-subtle ml-auto shrink-0 text-[11px]">{groupsLabel(groups.length)} · {tabsLabel(tabs)}</span>
      </Disclosure>
      {open && (
        <ul className="flex flex-col pl-4">
          {groups.map(g => <GroupBlock key={g.id} group={g} removed={removed} defaultOpen={openAll} />)}
        </ul>
      )}
    </li>
  )
}

/**
 * One side of the choice, as it is today, never a computed result: it does not
 * change with the choice, so comparing needs no memory. Overview first (spaces,
 * the level a big choice is made at), details on demand (groups, then tabs);
 * a small side opens fully. Each side scrolls on its own.
 */
export function SourceColumn({ title, spaces, removed = false, inBoth = new Set(), emptyText, includeEmpty = false }: {
  /** Without a title the column has no header row (the modal's header already names it). */
  title?: string; spaces: SavedSpace[]; removed?: boolean; inBoth?: Set<string>; emptyText: string
  /** Show spaces that hold no tabs too (a version restores structure, not only tabs). */
  includeEmpty?: boolean
}) {
  const withTabs = includeEmpty ? spaces : spaces.filter(s => spaceTabCount(s) > 0)
  const openAll = tabCount(spaces) <= OPEN_ALL_AT
  return (
    // Removal is shown by a label and struck-through text at fg-subtle, never by
    // opacity, so the list stays readable (>= 4.5:1, TASK-6).
    <section aria-label={title} className={cn("flex min-h-0 min-w-0 flex-col gap-2 rounded-lg border p-3 transition-colors", removed ? "border-danger/30" : "border-ink/10")}>
      {title !== undefined && (
        <div className="flex shrink-0 items-center justify-between gap-2 px-1">
          <h3 className="text-fg text-xs font-medium">{title}</h3>
          {removed
            ? <span className="rounded bg-danger/10 px-1.5 py-0.5 text-[11px] font-medium text-danger">Removed</span>
            : <span className="text-fg-subtle text-[11px]">{tabsLabel(tabCount(spaces))}</span>}
        </div>
      )}
      {withTabs.length === 0
        ? <p className="text-fg-subtle px-1 text-xs">{emptyText}</p>
        : (
          <ul className="flex min-h-0 flex-col overflow-y-auto">
            {withTabs.map(s => <SpaceBlock key={s.id} space={s} removed={removed} inBoth={inBoth.has(s.id)} openAll={openAll} />)}
          </ul>
        )}
    </section>
  )
}
