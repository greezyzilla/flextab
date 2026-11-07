import { useEffect, useMemo, useState, type ReactNode } from "react"
import { ChevronRight } from "lucide-react"
import { useSyncConflict } from "~src/store/useSyncConflict"
import { tabCap, usePlanStore } from "~src/store/usePlanStore"
import { resolveConflict } from "~src/services/syncEngine"
import { mergeSpacesGuest } from "~src/services/spacesMerge"
import { spaceTabCount } from "~src/services/spacesTree"
import { exportWorkspace } from "~src/services/exportWorkspace"
import type { SavedSpace, SavedTab } from "~src/types"
import { Button } from "~src/components/ui/button"
import { Label } from "~src/components/ui/label"
import { RadioGroup, RadioGroupItem } from "~src/components/ui/radio-group"
import { FaviconImg } from "~src/components/FaviconImg"
import { SpaceAvatar } from "~src/components/levelIcons"
import { cn } from "~src/lib/utils"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~src/components/ui/alert-dialog"

type Choice = "merge" | "server" | "local"

/** How many tabs a group shows before "+N more" (chunking keeps long lists scannable). */
const PREVIEW_TABS = 5
/** At or below this many tabs a side opens fully: a small set needs no overview step. */
const OPEN_ALL_AT = 15

const tabCount = (spaces: SavedSpace[]) => spaces.reduce((sum, s) => sum + spaceTabCount(s), 0)
const tabsLabel = (n: number) => `${n} tab${n === 1 ? "" : "s"}`
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
  return (
    <button type="button" aria-expanded={open} aria-label={label} onClick={onToggle}
      className="flex w-full min-w-0 items-center gap-2 rounded-md px-1 py-1 text-left outline-none hover:bg-ink/[0.04] focus-visible:ring-1 focus-visible:ring-ring">
      <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-fg-subtle transition-transform", open && "rotate-90")} aria-hidden />
      {children}
    </button>
  )
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
          <ul className="flex flex-col gap-1">
            {shown.map(t => (
              <li key={t.id} className="flex min-w-0 items-center gap-2">
                <FaviconImg src={t.favicon} className={cn("h-3.5 w-3.5 shrink-0", removed && "grayscale opacity-60")} />
                <span className={cn("truncate text-xs", strike || "text-fg")}>{t.title || t.url}</span>
                <span className="text-fg-subtle ml-auto shrink-0 text-[11px]">{hostOf(t.url)}</span>
              </li>
            ))}
          </ul>
          {group.tabs.length > PREVIEW_TABS && (
            <button type="button" onClick={() => setAll(v => !v)}
              className="text-fg-muted hover:text-fg self-start rounded text-[11px] outline-none focus-visible:ring-1 focus-visible:ring-ring">
              {all ? "Show fewer" : `+${group.tabs.length - PREVIEW_TABS} more`}
            </button>
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
function SourceColumn({ title, spaces, removed, inBoth, emptyText }: {
  title: string; spaces: SavedSpace[]; removed: boolean; inBoth: Set<string>; emptyText: string
}) {
  const withTabs = spaces.filter(s => spaceTabCount(s) > 0)
  const openAll = tabCount(spaces) <= OPEN_ALL_AT
  return (
    // Removal is shown by a label and struck-through text at fg-subtle, never by
    // opacity, so the list stays readable (>= 4.5:1, TASK-6).
    <section aria-label={title} className={cn("flex min-h-0 min-w-0 flex-col gap-2 rounded-lg border p-3 transition-colors", removed ? "border-red-400/30" : "border-ink/10")}>
      <div className="flex shrink-0 items-center justify-between gap-2 px-1">
        <h3 className="text-fg text-xs font-medium">{title}</h3>
        {removed
          ? <span className="rounded bg-red-400/10 px-1.5 py-0.5 text-[11px] font-medium text-danger">Removed</span>
          : <span className="text-fg-subtle text-[11px]">{tabsLabel(tabCount(spaces))}</span>}
      </div>
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

// Shown on sign-in when this device has local tabs AND the account already has
// tabs, or when the device kept tabs from an earlier sign-out (TASK-11): then
// the account may be empty, and those tabs must not move into it unasked.
// Nothing is overwritten until the user applies.
export function SyncConflictModal() {
  const { pending, server, local } = useSyncConflict()
  // An empty account makes "merge" and "keep this device's" the same thing, so
  // the choice is only: bring these tabs into the account, or start it empty.
  const accountEmpty = tabCount(server) === 0
  const [choice, setChoice] = useState<Choice>("merge")
  useEffect(() => { if (pending) setChoice(accountEmpty ? "local" : "merge") }, [pending, accountEmpty])

  const merged = useMemo(() => mergeSpacesGuest(server, local), [server, local])
  const deviceTabs = tabCount(local), accountTabs = tabCount(server), mergedTabs = tabCount(merged)
  const duplicates = deviceTabs + accountTabs - mergedTabs
  // Spaces the merge combines (it matches by id): marked on both sides.
  const inBoth = useMemo(() => new Set(local.filter(l => server.some(s => s.id === l.id)).map(l => l.id)), [server, local])
  const combined = local.filter(l => inBoth.has(l.id)).map(l => l.name)
  const combinedText = combined.length === 0 ? "" : combined.length <= 2 ? `, ${combined.join(" and ")} combined` : `, ${combined.length} spaces combined`

  // One line of effect per choice: the system counts, the user decides.
  const opts: { id: Choice; label: string; effect: string }[] = accountEmpty
    ? [
        { id: "local", label: "Add this device's tabs to this account", effect: `Uploads ${tabsLabel(deviceTabs)}` },
        { id: "server", label: "Start with an empty account", effect: `Removes this device's ${tabsLabel(deviceTabs)}` },
      ]
    : [
        { id: "merge", label: "Merge both", effect: `Keeps ${tabsLabel(mergedTabs)}${combinedText}${duplicates > 0 ? `, ${duplicates} duplicate${duplicates === 1 ? "" : "s"} dropped` : ""}` },
        { id: "server", label: "Keep my account's", effect: `Removes this device's ${tabsLabel(deviceTabs)}` },
        { id: "local", label: "Keep this device's", effect: `Replaces the account's ${tabsLabel(accountTabs)}` },
      ]
  // The plan's sync cap (TASK-9): say so before a choice uploads more tabs than
  // the account may sync. Keeping the account's own tabs never grows it.
  const cap = tabCap(usePlanStore((s) => s.status))
  const resultTabs = choice === "merge" ? mergedTabs : choice === "local" ? deviceTabs : accountTabs
  const overCap = cap !== undefined && cap > 0 && resultTabs > cap && resultTabs > accountTabs
  useEffect(() => { if (pending) void usePlanStore.getState().load() }, [pending])
  const deviceRemoved = choice === "server"
  const accountRemoved = choice === "local" && !accountEmpty

  // Controlled solely by store pending: no Esc/outside dismiss until Apply
  // clears pending.
  return (
    <AlertDialog open={pending}>
      <AlertDialogContent className="w-[760px] max-w-[94vw] max-h-[88vh] p-0 gap-0 flex flex-col font-sans">
        <AlertDialogHeader className="p-6 pb-4 space-y-1.5 shrink-0 text-left">
          <AlertDialogTitle className="text-fg text-base font-medium">Choose what to keep</AlertDialogTitle>
          <AlertDialogDescription className="text-fg-subtle text-sm leading-relaxed">
            {accountEmpty
              ? "This device has tabs from an earlier sign-in. Choose whether they belong in this account. Nothing changes until you apply."
              : "This device and your account both have saved tabs. Nothing changes until you apply."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="grid min-h-[120px] flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-3 px-6 sm:grid-cols-2 sm:grid-rows-[minmax(0,1fr)]">
          <SourceColumn title="On this device" spaces={local} removed={deviceRemoved} inBoth={inBoth} emptyText="No tabs on this device." />
          <SourceColumn title="In this account" spaces={server} removed={accountRemoved} inBoth={inBoth} emptyText="Empty. Nothing in this account yet." />
        </div>

        <RadioGroup value={choice} onValueChange={(v) => setChoice(v as Choice)} className="flex shrink-0 flex-col gap-2 px-6 pt-4">
          {opts.map((opt) => (
            <Label
              key={opt.id}
              htmlFor={`sync-choice-${opt.id}`}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-4 py-2.5 font-normal transition-colors",
                choice === opt.id ? "border-[var(--accent)] bg-[var(--accent-subtle)]" : "border-ink/10 bg-ink/[0.02] hover:bg-ink/[0.05]",
              )}
            >
              <span className="flex items-center gap-2.5">
                <RadioGroupItem value={opt.id} id={`sync-choice-${opt.id}`} />
                <span className="text-fg text-sm">{opt.label}</span>
              </span>
              <span className="text-fg-subtle text-right text-xs">{opt.effect}</span>
            </Label>
          ))}
        </RadioGroup>

        {overCap && (
          <p role="note" className="mx-6 mt-3 shrink-0 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-warning-body/90 text-xs leading-relaxed">
            Your plan syncs up to {cap} tabs. With {resultTabs}, sync pauses until you remove {resultTabs - cap}. Nothing is lost on this device.
          </p>
        )}

        <AlertDialogFooter className="mt-4 flex-row items-center justify-between gap-2 border-t border-line p-6 pt-4 shrink-0 sm:justify-between sm:space-x-0">
          {/* Lower the anxiety of removing: a copy first, in one click, kept apart
              from the destructive Apply (left vs right). */}
          {deviceRemoved
            ? <Button variant="link" size="sm" onClick={() => exportWorkspace()} className="!px-0">Download this device's tabs first</Button>
            : <span />}
          <Button variant={deviceRemoved || accountRemoved ? "destructive" : "default"} onClick={() => resolveConflict(choice)}>Apply</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
