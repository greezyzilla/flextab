import { useMemo, useState } from "react"
import { useMergeConflict } from "~src/store/useMergeConflict"
import { resolveMergeConflicts, dismissMergeConflicts } from "~src/services/syncEngine"
import { merge3, type Conflict, type Resolutions } from "~src/services/spacesMerge3"
import { spaceTabCount } from "~src/services/spacesMerge"
import { Button } from "~src/components/ui/button"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~src/components/ui/alert-dialog"

type Side = "server" | "local"

// The default choice for a conflict: keep this device's edit / the surviving edit.
function defaultChoice(c: Conflict): Side {
  if (c.kind === "field") return "local"
  // delete-edit: keep the edit → the side that did NOT delete.
  return c.deletedOn === "server" ? "local" : "server"
}

function fieldLabel(c: Conflict): string {
  if (c.kind === "field") return c.field === "name" || c.field === "title" ? "name" : (c.field ?? "value")
  return "deleted vs. edited"
}

// For a conflict + a chosen side, describe what that choice does.
function optionsFor(c: Conflict): { side: Side; label: string; detail: string }[] {
  if (c.kind === "field") {
    return [
      { side: "local", label: "This device", detail: String(c.local ?? "") },
      { side: "server", label: "My account", detail: String(c.server ?? "") },
    ]
  }
  const keepSide: Side = c.deletedOn === "server" ? "local" : "server"
  const dropSide: Side = keepSide === "local" ? "server" : "local"
  return [
    { side: keepSide, label: "Keep it", detail: "Restore the edited item" },
    { side: dropSide, label: "Delete it", detail: "Honor the deletion" },
  ]
}

// Shown when a 3-way reconcile finds true conflicts. Each item is resolved
// individually; everything non-conflicting is already merged. Nothing is written
// until Apply — "Ignore for now" keeps local data and pauses sync.
export function MergeConflictModal() {
  const { pending, conflicts, base, server, local } = useMergeConflict()
  const [choices, setChoices] = useState<Resolutions>({})

  // Seed defaults whenever a fresh set of conflicts opens.
  const seeded = useMemo(() => {
    const out: Resolutions = {}
    for (const c of conflicts) out[c.key] = choices[c.key] ?? defaultChoice(c)
    return out
  }, [conflicts, choices])

  const resolvedCount = useMemo(
    () =>
      merge3(base, server, local, seeded).merged.reduce(
        (n, s) => n + spaceTabCount(s),
        0,
      ),
    [base, server, local, seeded],
  )

  const byPath = new Map<string, Conflict[]>()
  for (const c of conflicts) {
    const arr = byPath.get(c.path) ?? []
    arr.push(c)
    byPath.set(c.path, arr)
  }

  // Controlled solely by store pending. Ignore/Apply clear pending via engine
  // helpers — no Esc/outside path that would accidentally pause sync.
  return (
    <AlertDialog open={pending}>
      <AlertDialogContent className="w-[560px] max-w-[92vw] max-h-[85vh] p-0 gap-0 flex flex-col font-sans">
        <AlertDialogHeader className="p-6 pb-4 space-y-1.5 shrink-0 text-left">
          <AlertDialogTitle className="text-white/90 text-base font-medium">
            Resolve sync conflicts
          </AlertDialogTitle>
          <AlertDialogDescription className="text-white/45 text-sm leading-relaxed">
            {conflicts.length} item{conflicts.length !== 1 ? "s" : ""} changed on both this device and your account.
            Everything else was merged automatically. Pick which to keep — nothing changes until you apply.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="px-6 flex-1 overflow-y-auto min-h-[100px]">
          <div className="flex flex-col gap-3.5 pb-2">
            {[...byPath.entries()].map(([path, items]) => (
              <div key={path} className="flex flex-col gap-2">
                {path && <div className="text-white/35 text-[11px] font-medium truncate">{path}</div>}
                {items.map((c) => {
                  const opts = optionsFor(c)
                  return (
                    <div key={c.key} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-white/80 text-sm truncate">{c.name || "(untitled)"}</span>
                        <span className="text-white/30 text-[10px] shrink-0">{fieldLabel(c)}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {opts.map((opt) => {
                          const active = seeded[c.key] === opt.side
                          return (
                            <button
                              key={opt.side}
                              type="button"
                              onClick={() => setChoices((prev) => ({ ...prev, [c.key]: opt.side }))}
                              className={`flex flex-col gap-0.5 rounded-md border px-2.5 py-1.5 text-left transition-colors ${
                                active ? "" : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
                              }`}
                              style={active ? { borderColor: "var(--accent)", backgroundColor: "var(--accent-subtle)" } : undefined}
                            >
                              <span className="text-white/70 text-[11px] font-medium">{opt.label}</span>
                              <span className="text-white/40 text-[11px] truncate">{opt.detail || "—"}</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        <AlertDialogFooter className="p-6 pt-4 flex-row items-center justify-between gap-2 shrink-0 border-t border-black-800 sm:justify-between sm:space-x-0">
          <span className="text-white/30 text-[11px]">
            {resolvedCount} tab{resolvedCount !== 1 ? "s" : ""} after merge
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                dismissMergeConflicts()
                setChoices({})
              }}
            >
              Ignore for now
            </Button>
            <Button
              variant="default"
              onClick={() => {
                resolveMergeConflicts(seeded)
                setChoices({})
              }}
            >
              Apply
            </Button>
          </div>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
