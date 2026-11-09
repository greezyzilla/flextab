import { useEffect, useMemo, useState } from "react"
import { useSyncConflict } from "~src/store/useSyncConflict"
import { tabCap, usePlanStore } from "~src/store/usePlanStore"
import { resolveConflict } from "~src/services/syncEngine"
import { mergeSpacesGuest } from "~src/services/spacesMerge"
import { spaceTabCount } from "~src/services/spacesTree"
import { exportWorkspace } from "~src/services/exportWorkspace"
import type { SavedSpace } from "~src/types"
import { RadioGroup } from "~src/components/ui/radio-group"
import { SourceColumn, tabCount, tabsLabel } from "~src/components/WorkspaceTree"
import { Modal, ModalFooter, ModalHeader, ModalLink, ModalOptionCard } from "~src/components/ui/modal"

type Choice = "merge" | "server" | "local"


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

  // A forced decision (modal standard §2, D2): no Cancel, Esc or outside
  // click until a choice is applied, which clears pending. Focus opens on the
  // chosen option. The primary names the choice instead of "Apply".
  const chosen = opts.find((o) => o.id === choice) ?? opts[0]
  return (
    <Modal kind="alert" size="l" open={pending} onOpenChange={() => {}} dismissible={false}>
      <ModalHeader title="Choose what to keep"
        description={accountEmpty
          ? "This device has tabs from an earlier sign-in. Choose whether they belong in this account. Nothing changes until you apply."
          : "This device and your account both have saved tabs. Nothing changes until you apply."} />

      {/* The two sides scroll on their own, so the choices and the footer stay in view (§3). */}
      <div className="grid min-h-[120px] flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-3 sm:grid-cols-2 sm:grid-rows-[minmax(0,1fr)]">
        <SourceColumn title="On this device" spaces={local} removed={deviceRemoved} inBoth={inBoth} emptyText="No tabs on this device." />
        <SourceColumn title="In this account" spaces={server} removed={accountRemoved} inBoth={inBoth} emptyText="Empty. Nothing in this account yet." />
      </div>

      <div className="flex shrink-0 flex-col gap-2">
        <RadioGroup value={choice} onValueChange={(v) => setChoice(v as Choice)} aria-label="What to keep">
          {opts.map((opt) => (
            <ModalOptionCard key={opt.id} id={`sync-choice-${opt.id}`} value={opt.id} selected={choice === opt.id}
              title={opt.label} aside={opt.effect}
              danger={opt.id === "server" || (opt.id === "local" && !accountEmpty)} />
          ))}
        </RadioGroup>
        {overCap && (
          <p role="note" className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-warning-body/90 text-xs leading-relaxed">
            Your plan syncs up to {cap} tabs. With {resultTabs}, sync pauses until you remove {resultTabs - cap}. Nothing is lost on this device.
          </p>
        )}
      </div>

      {/* Lower the anxiety of removing: a copy first, in one click, kept apart
          from the destructive primary (start vs end). */}
      <ModalFooter
        start={deviceRemoved ? <ModalLink onClick={() => exportWorkspace()}>Download this device's tabs first</ModalLink> : undefined}
        primary={{ label: chosen.label, tone: deviceRemoved || accountRemoved ? "destructive" : "primary", onClick: () => resolveConflict(choice) }} />
    </Modal>
  )
}
