import { useState } from "react"
import { Modal, ModalBody, ModalFooter, ModalHeader } from "~src/components/ui/modal"
import { DestinationPicker, describeTarget, type PickerValue } from "~src/components/DestinationPicker"
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore"

/**
 * "Move to…" / "Save to…": the non-drag way to put a tab or a group
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
    <Modal kind="dialog" size="m" open onOpenChange={(o) => { if (!o) onClose() }}>
      <ModalHeader title={title} description={description} />
      <ModalBody>
        <DestinationPicker groupLevel={groupLevel} value={target} onChange={setTarget} />
        {/* The picker marks the chosen place itself; only say something when nothing is chosen. */}
        {!where && <span className="text-fg-subtle text-xs font-sans" aria-live="polite">Pick or create a category.</span>}
      </ModalBody>
      <ModalFooter primary={{ label: confirmLabel, disabled: !where, onClick: () => { onConfirm(target); onClose() } }} />
    </Modal>
  )
}
