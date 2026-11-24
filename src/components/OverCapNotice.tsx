import { useOverCapNotice } from "~src/store/useOverCapNotice"
import { acknowledgeOverCap } from "~src/services/syncEngine"
import { navigate } from "~src/lib/route"
import { Modal, ModalFooter, ModalHeader, ModalLink } from "~src/components/ui/modal"

/**
 * A first sign-in would upload more tabs than the plan syncs. Say so
 * before the upload (error prevention) instead of ending the first sync in
 * "Sync paused". There is nothing to choose, so it is a notice, not a choice:
 * "Got it" is primary and the upgrade path stays secondary.
 */
export function OverCapNotice() {
  const { pending, tabs, cap } = useOverCapNotice()
  const over = tabs - cap
  return (
    <Modal kind="alert" size="s" open={pending} onOpenChange={(open) => { if (!open) acknowledgeOverCap() }}>
      <ModalHeader title={`Your plan syncs up to ${cap} tabs`}
        description={`This device has ${tabs} saved tabs. Nothing will sync until you remove ${over} or upgrade. All ${tabs} stay on this device.`} />
      <ModalFooter
        start={<ModalLink onClick={() => { acknowledgeOverCap(); navigate("/settings/plan") }}>See plan</ModalLink>}
        cancel={false}
        primary={{ label: "Got it", onClick: () => acknowledgeOverCap() }} />
    </Modal>
  )
}
