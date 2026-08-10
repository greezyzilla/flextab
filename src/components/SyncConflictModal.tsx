import { useMemo, useState } from "react"
import { useSyncConflict } from "~src/store/useSyncConflict"
import { resolveConflict, mergeSpaces } from "~src/services/syncEngine"
import { spaceTabCount } from "~src/services/spacesMerge"
import type { SavedSpace } from "~src/types"
import { Button } from "~src/components/ui/button"
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
// tabs. Nothing is overwritten until the user picks; each option is previewed.
export function SyncConflictModal() {
  const { pending, server, local } = useSyncConflict()
  const [choice, setChoice] = useState<Choice>("merge")

  const merged = useMemo(() => mergeSpaces(server, local), [server, local])
  const result = choice === "merge" ? merged : choice === "server" ? server : local

  const opts: { id: Choice; label: string; spaces: SavedSpace[] }[] = [
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
          <AlertDialogTitle className="text-white/90 text-base font-medium">
            Choose what to keep
          </AlertDialogTitle>
          <AlertDialogDescription className="text-white/45 text-sm leading-relaxed">
            This device has local tabs and your account already has saved tabs.
            Pick an option — nothing changes until you apply.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Options */}
        <div className="px-6 flex flex-col gap-2 shrink-0">
          {opts.map((opt) => {
            const t = totals(opt.spaces)
            const active = choice === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setChoice(opt.id)}
                className={`flex items-center justify-between rounded-lg border px-4 py-2.5 text-left transition-colors ${
                  active ? "" : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
                }`}
                style={active ? { borderColor: "var(--accent)", backgroundColor: "var(--accent-subtle)" } : undefined}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className="w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0"
                    style={{ borderColor: active ? "var(--accent)" : "rgba(255,255,255,0.25)" }}
                  >
                    {active && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "var(--accent)" }} />}
                  </span>
                  <span className="text-white/80 text-sm">{opt.label}</span>
                </div>
                <span className="text-white/35 text-[11px]">
                  {t.spaces} space{t.spaces !== 1 ? "s" : ""} · {t.tabs} tab{t.tabs !== 1 ? "s" : ""}
                </span>
              </button>
            )
          })}
        </div>

        {/* Preview of the chosen result */}
        <div className="px-6 pt-4 pb-2 shrink-0">
          <div className="text-white/40 text-[11px] font-medium uppercase tracking-wider">Result preview</div>
        </div>
        <div className="px-6 flex-1 overflow-y-auto min-h-[80px]">
          {result.length === 0 ? (
            <div className="text-white/30 text-xs py-4">Nothing — an empty workspace.</div>
          ) : (
            <div className="flex flex-col gap-2.5 pb-2">
              {result.map((s) => {
                const groups = groupSummaries(s)
                return (
                  <div key={s.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span className="text-white/75 text-xs font-medium truncate">{s.name}</span>
                      <span className="text-white/30 text-[10px] shrink-0">
                        {groups.length} group{groups.length !== 1 ? "s" : ""} · {spaceTabCount(s)} tabs
                      </span>
                    </div>
                    {groups.length > 0 && (
                      <div className="mt-1 text-white/35 text-[11px] leading-relaxed truncate">
                        {groups.map((g) => `${g.name} (${g.tabs})`).join(" · ")}
                      </div>
                    )}
                  </div>
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
