import * as React from "react"
import { Modal, ModalFooter, ModalHeader } from "./modal"

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  message: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** Style the confirm button as destructive (red). Default true. */
  destructive?: boolean
  /** A helper action at the footer's start, e.g. "Export JSON" (modal standard §7). */
  start?: React.ReactNode
  onConfirm: () => void
}

/**
 * A confirmation: the standard's alert at size S (docs/modal-standard.md). role="alertdialog",
 * focus on Cancel, Esc cancels, an outside click never dismisses. Confirming runs onConfirm and
 * closes.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  destructive = true,
  start,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Modal kind="alert" size="s" open={open} onOpenChange={onOpenChange}>
      <ModalHeader title={title} description={message} />
      <ModalFooter
        start={start}
        cancel={cancelLabel}
        primary={{
          label: confirmLabel,
          tone: destructive ? "destructive" : "primary",
          onClick: () => { onConfirm(); onOpenChange(false) },
        }}
      />
    </Modal>
  )
}
