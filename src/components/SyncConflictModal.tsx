import { useEffect, useMemo, useState } from "react"
import { useSyncConflict } from "~src/store/useSyncConflict"
import { resolveConflict } from "~src/services/syncEngine"
import { mergeSpacesGuest } from "~src/services/spacesMerge"
import { spaceTabCount } from "~src/services/spacesTree"
import type { SavedSpace } from "~src/types"
import { Button } from "~src/components/ui/button"
import { Label } from "~src/components/ui/label"
import { RadioGroup, RadioGroupItem } from "~src/components/ui/radio-group"
import { Card } from "~src/components/ui/card"
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

function groupSummaries(s: SavedSpace): { name: string; tabs: number }[] {
  const out: { name: string; tabs: number }[] = []
  for (const p of s.projects || []) {
    for (const c of p.categories || []) {
      for (const g of c.groups || []) out.push({ name: g.name, tabs: g.tabs?.length || 0 })
    }
  }
  return out
}

function totals(spaces: SavedSpace[]) {
  return {
    spaces: spaces.length,
    tabs: spaces.reduce((sum, s) => sum + spaceTabCount(s), 0),
  }
}

// Shown on sign-in when this device has local tabs AND the account already has
// tabs, or when the device kept tabs from an earlier sign-out (TASK-11): then
// the account may be empty, and those tabs must not move into it unasked.
// Nothing is overwritten until the user picks; each option is previewed.
export function SyncConflictModal() {
  const { pending, server, local } = useSyncConflict()
  // An empty account makes "merge" and "keep this device's" the same thing, so
  // the choice is only: bring these tabs into the account, or start it empty.
  const accountEmpty = totals(server).tabs === 0
  const [choice, setChoice] = useState<Choice>("merge")
  useEffect(() => { if (pending) setChoice(accountEmpty ? "local" : "merge") }, [pending, accountEmpty])

  const merged = useMemo(() => mergeSpacesGuest(server, local), [server, local])
  const result = choice === "merge" ? merged : choice === "server" ? server : local

  const opts: { id: Choice; label: string; spaces: SavedSpace[] }[] = accountEmpty
    ? [
        { id: "local", label: "Add this device's tabs to this account", spaces: local },
        { id: "server", label: "Start with an empty account", spaces: server },
      ]
    : [
        { id: "merge", label: "Merge both", spaces: merged },
        { id: "server", label: "Keep my account's", spaces: server },
        { id: "local", label: "Keep this device's", spaces: local },
      ]

  // Controlled solely by store pending — no Esc/outside dismiss until Apply
  // clears pending (same as the previous hand-rolled shell).
  return (
    <AlertDialog open={pending}>
      <AlertDialogContent className="w-[560px] max-w-[92vw] max-h-[85vh] p-0 gap-0 flex flex-col font-sans">
        <AlertDialogHeader className="p-6 pb-4 space-y-1.5 shrink-0 text-left">
          <AlertDialogTitle className="text-fg text-base font-medium">
            Choose what to keep
          </AlertDialogTitle>
          <AlertDialogDescription className="text-fg-subtle text-sm leading-relaxed">
            {accountEmpty
              ? "This device has tabs from an earlier sign-in. Choose whether they belong in this account. Nothing changes until you apply."
              : "This device has local tabs and your account already has saved tabs. Pick an option. Nothing changes until you apply."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <RadioGroup
          value={choice}
          onValueChange={(v) => setChoice(v as Choice)}
          className="px-6 flex flex-col gap-2 shrink-0"
        >
          {opts.map((opt) => {
            const t = totals(opt.spaces)
            const active = choice === opt.id
            return (
              <Label
                key={opt.id}
                htmlFor={`sync-choice-${opt.id}`}
                className={cn(
                  "flex cursor-pointer items-center justify-between rounded-lg border px-4 py-2.5 font-normal transition-colors",
                  active
                    ? "border-[var(--accent)] bg-[var(--accent-subtle)]"
                    : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]",
                )}
              >
                <div className="flex items-center gap-2.5">
                  <RadioGroupItem value={opt.id} id={`sync-choice-${opt.id}`} />
                  <span className="text-fg text-sm">{opt.label}</span>
                </div>
                <span className="text-fg-subtle text-[11px]">
                  {t.spaces} space{t.spaces !== 1 ? "s" : ""} · {t.tabs} tab{t.tabs !== 1 ? "s" : ""}
                </span>
              </Label>
            )
          })}
        </RadioGroup>

        <div className="px-6 pt-4 pb-2 shrink-0">
          <div className="text-fg-subtle text-[11px] font-medium uppercase tracking-wider">Result preview</div>
        </div>
        <div className="px-6 flex-1 overflow-y-auto min-h-[80px]">
          {result.length === 0 ? (
            <div className="text-fg-subtle text-xs py-4">
              {accountEmpty ? "The tabs on this device are removed. The workspace starts empty." : "Nothing here. The workspace is empty."}
            </div>
          ) : (
            <div className="flex flex-col gap-2.5 pb-2">
              {result.map((s) => {
                const groups = groupSummaries(s)
                return (
                  <Card key={s.id} className="px-3 py-2 shadow-none">
                    <div className="flex items-center justify-between">
                      <span className="text-fg-muted text-xs font-medium truncate">{s.name}</span>
                      <span className="text-fg-subtle text-[10px] shrink-0">
                        {groups.length} group{groups.length !== 1 ? "s" : ""} · {spaceTabCount(s)} tab{spaceTabCount(s) !== 1 ? "s" : ""}
                      </span>
                    </div>
                    {groups.length > 0 && (
                      <div className="mt-1 text-fg-subtle text-[11px] leading-relaxed truncate">
                        {groups.map((g) => `${g.name} (${g.tabs})`).join(" · ")}
                      </div>
                    )}
                  </Card>
                )
              })}
            </div>
          )}
        </div>

        <AlertDialogFooter className="p-6 pt-4 flex-row items-center justify-end gap-2 shrink-0 border-t border-black-800 sm:space-x-0">
          <Button variant="default" onClick={() => resolveConflict(choice)}>
            Apply
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
