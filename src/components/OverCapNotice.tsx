import { useOverCapNotice } from "~src/store/useOverCapNotice"
import { acknowledgeOverCap } from "~src/services/syncEngine"
import { navigate } from "~src/lib/route"
import { Button } from "~src/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~src/components/ui/alert-dialog"

/**
 * TASK-33: a first sign-in would upload more tabs than the plan syncs. Say so
 * before the upload (error prevention) instead of ending the first sync in
 * "Sync paused". There is nothing to choose, so it is a notice, not a choice:
 * "Got it" is primary and the upgrade path stays secondary.
 */
export function OverCapNotice() {
  const { pending, tabs, cap } = useOverCapNotice()
  const over = tabs - cap
  return (
    <AlertDialog open={pending} onOpenChange={(open) => { if (!open) acknowledgeOverCap() }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Your plan syncs up to {cap} tabs</AlertDialogTitle>
          <AlertDialogDescription>
            This device has {tabs} saved tabs. Nothing will sync until you remove {over} or upgrade. All {tabs} stay on this device.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="ghost" size="sm" onClick={() => { acknowledgeOverCap(); navigate("/settings/plan") }}>See plan</Button>
          <AlertDialogAction size="sm" onClick={() => acknowledgeOverCap()}>Got it</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
