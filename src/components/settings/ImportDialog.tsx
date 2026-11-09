import { useEffect, useState } from "react"
import { RadioGroup } from "~src/components/ui/radio-group"
import { Modal, ModalBody, ModalFooter, ModalHeader, ModalNote, ModalOptionCard } from "~src/components/ui/modal"
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
export function ImportDialog({ parsed, onClose, onDone }: {
  parsed: ParsedImport | null
  /** The chosen file. Not shown: the description says what the file holds instead (modal standard §10). */
  fileName: string
  onClose: () => void
  onDone: (message: string) => void
}) {
  const savedSpaces = useSavedSpacesStore((s) => s.savedSpaces)
  const setActiveSpace = useSavedSpacesStore((s) => s.setActiveSpace)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const cap = tabCap(usePlanStore((s) => s.status))
  const [mode, setMode] = useState<Mode>("add")
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
    <ModalOptionCard id={`import-${value}`} value={value} selected={mode === value} title={title} hint={detail} danger={value === "replace"} />
  )

  // Focus opens on the chosen option, never on the primary: with Replace
  // chosen, one Enter must not replace the workspace (modal standard §8).
  return (
    <Modal kind="dialog" size="m" open onOpenChange={(open) => { if (!open) onClose() }} dirty={mode !== "add"}>
      <ModalHeader title={`Import from ${SOURCE_LABEL[parsed.source]}`} description={`${plural(tabs, "tab")} ${where}.`} />
      <ModalBody>
        {parsed.skipped > 0 && (
          <ModalNote>
            {plural(parsed.skipped, "link")} left out: not {parsed.skipped === 1 ? "a web page" : "web pages"} (bookmarklets, browser or file pages).
          </ModalNote>
        )}
        {canReplace ? (
          <RadioGroup value={mode} onValueChange={(v) => setMode(v as Mode)} aria-label="How to import">
            {option("add", "Add to my workspace", `As ${spacesText} beside yours.`)}
            {option("replace", "Replace everything", `Removes your current ${plural(savedSpaces.length, "space")}. This can't be undone.`)}
          </RadioGroup>
        ) : (
          <p className="text-fg-muted text-sm leading-5">Adds {spacesText} beside your workspace. Nothing you have changes.</p>
        )}
        {overCap && (
          <p role="note" className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-warning-body/90 text-xs leading-relaxed">
            This puts you at {after} of {cap} tabs. Sync pauses until you remove {after - cap}. Everything still saves on this device.
          </p>
        )}
      </ModalBody>
      <ModalFooter primary={{
        label: replace ? "Replace workspace" : `Add ${plural(tabs, "tab")}`,
        tone: replace ? "destructive" : "primary",
        onClick: apply,
      }} />
    </Modal>
  )
}
