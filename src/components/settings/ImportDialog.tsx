import { useEffect, useRef, useState } from "react"
import { cn } from "~src/lib/utils"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~src/components/ui/dialog"
import { Button } from "~src/components/ui/button"
import { Label } from "~src/components/ui/label"
import { RadioGroup, RadioGroupItem } from "~src/components/ui/radio-group"
import { useAuthStore } from "~src/store/useAuthStore"
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore"
import { tabCap, usePlanStore } from "~src/store/usePlanStore"
import { countGroups, countTabs, SOURCE_LABEL, withFreshIds, type ParsedImport } from "~src/services/importFormats"
import type { SavedSpace } from "~src/types"
import * as yjs from "~src/lib/yjsDoc"

type Mode = "add" | "replace"

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`

/**
 * Preview an import before anything is written (TASK-12): what the file holds,
 * what was left out, what it does to the plan's sync cap, and whether it adds
 * beside the workspace (the default) or replaces it (FlexTab backups only:
 * that is a restore).
 */
export function ImportDialog({ parsed, fileName, onClose, onDone }: {
  parsed: ParsedImport | null
  fileName: string
  onClose: () => void
  onDone: (message: string) => void
}) {
  const savedSpaces = useSavedSpacesStore((s) => s.savedSpaces)
  const setActiveSpace = useSavedSpacesStore((s) => s.setActiveSpace)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const cap = tabCap(usePlanStore((s) => s.status))
  const [mode, setMode] = useState<Mode>("add")
  const primaryRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!parsed) return
    setMode("add")
    if (isAuthenticated) void usePlanStore.getState().load()
  }, [parsed, isAuthenticated])

  if (!parsed) return null
  const canReplace = parsed.source === "flextab"
  const replace = canReplace && mode === "replace"
  const tabs = countTabs(parsed.spaces)
  const current = countTabs(savedSpaces)
  const after = replace ? tabs : current + tabs
  // Same rule as the server: a write may not grow the tree past the cap.
  const overCap = isAuthenticated && cap !== undefined && cap > 0 && after > cap && after > current
  const names = parsed.spaces.map((s) => `“${s.name}”`)
  const spacesText = parsed.spaces.length === 1 ? `a new space ${names[0]}` : `${parsed.spaces.length} new spaces`

  const apply = () => {
    if (replace) {
      yjs.setSpaces(parsed.spaces)
      onDone(`Replaced your workspace with ${plural(parsed.spaces.length, "space")}`)
    } else {
      const added: SavedSpace[] = parsed.source === "flextab" ? withFreshIds(parsed.spaces) : parsed.spaces
      added.forEach((s, i) => yjs.addSpace({ ...s, order: savedSpaces.length + i }))
      if (added[0]) setActiveSpace(added[0].id)
      onDone(`Added ${plural(tabs, "tab")} as ${spacesText}`)
    }
    onClose()
  }

  const groups = countGroups(parsed.spaces)
  const where = parsed.spaces.length > 1 ? `in ${plural(groups, "group")} across ${plural(parsed.spaces.length, "space")}` : `in ${plural(groups, "group")}`
  const option = (value: Mode, title: string, detail: string) => (
    <Label
      htmlFor={`import-${value}`}
      className={cn(
        "flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 font-normal transition-colors",
        // The destructive choice reads as such once chosen, like its red button.
        mode !== value ? "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
          : value === "replace" ? "border-red-500/50 bg-red-500/10" : "border-[var(--accent)] bg-[var(--accent-subtle)]",
      )}
    >
      <RadioGroupItem value={value} id={`import-${value}`} className="mt-0.5" />
      <span className="flex flex-col gap-0.5">
        <span className="text-fg text-sm">{title}</span>
        <span className="text-fg-subtle text-xs">{detail}</span>
      </span>
    </Label>
  )

  // Three groups, spaced apart (Proximity, Common Region): what the file
  // holds, what importing does to the workspace, and the actions.
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent
        className="w-full max-w-md p-5"
        // Start on the action, not on Cancel: Cancel stays one Tab or Esc away.
        onOpenAutoFocus={(e) => { e.preventDefault(); primaryRef.current?.focus() }}
      >
        <DialogHeader>
          <DialogTitle className="text-fg font-sans text-base font-medium">Import from {SOURCE_LABEL[parsed.source]}</DialogTitle>
          <DialogDescription className="truncate text-xs">{fileName}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 pt-4 pb-5">
          <div className="flex flex-col gap-1.5 rounded-lg border border-white/10 bg-white/[0.02] px-3.5 py-3">
            <p className="text-fg-subtle text-sm"><span className="text-fg text-base font-medium tabular-nums">{plural(tabs, "tab")}</span> {where}</p>
            {parsed.skipped > 0 && (
              <p className="text-fg-subtle text-xs leading-relaxed">
                {plural(parsed.skipped, "link")} left out: not {parsed.skipped === 1 ? "a web page" : "web pages"} (bookmarklets, browser or file pages).
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2.5">
            {canReplace ? (
              <RadioGroup value={mode} onValueChange={(v) => setMode(v as Mode)} aria-label="How to import" className="flex flex-col gap-2">
                {option("add", "Add to my workspace", `As ${spacesText} beside yours.`)}
                {option("replace", "Replace everything", `Removes your current ${plural(savedSpaces.length, "space")}. This can't be undone.`)}
              </RadioGroup>
            ) : (
              <p className="text-fg-muted text-sm leading-relaxed">Adds {spacesText} beside your workspace. Nothing you have changes.</p>
            )}
            {overCap && (
              <p role="note" className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-amber-200/90 text-xs leading-relaxed">
                This puts you at {after} of {cap} tabs. Sync pauses until you remove {after - cap}. Everything still saves on this device.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button ref={primaryRef} variant={replace ? "destructive" : "default"} onClick={apply}>
            {replace ? "Replace workspace" : `Add ${plural(tabs, "tab")}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
