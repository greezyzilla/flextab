import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~src/components/ui/dialog"
import { Button } from "~src/components/ui/button"
import { DestinationPicker, describeTarget, type PickerValue } from "~src/components/DestinationPicker"
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore"

/**
 * "Move to…" / "Save to…" (TASK-5): the non-drag way to put a tab or a group
 * somewhere else, with the same destination picker as the save flows.
 */
export function PickDestinationDialog({ title, description, groupLevel = false, initial, confirmLabel, onConfirm, onClose }: {
  title: string
  description: string
  groupLevel?: boolean
  initial: PickerValue
  confirmLabel: string
  onConfirm: (target: PickerValue) => void
  onClose: () => void
}) {
  const savedSpaces = useSavedSpacesStore((s) => s.savedSpaces)
  const [target, setTarget] = useState<PickerValue>(initial)
  const where = describeTarget(savedSpaces, target)
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="w-full max-w-md p-5">
        <DialogHeader>
          <DialogTitle className="text-fg font-sans text-base font-medium">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5 py-2">
          <DestinationPicker groupLevel={groupLevel} value={target} onChange={setTarget} />
          <span className="text-fg-subtle text-xs font-sans truncate" aria-live="polite">
            {where ?? "Pick or create a category."}
          </span>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="default" disabled={!where} onClick={() => { onConfirm(target); onClose() }}>{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
