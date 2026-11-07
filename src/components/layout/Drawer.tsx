import { useRef } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { X } from "lucide-react"

interface DrawerProps {
  id?: string
  side: "left" | "right"
  open: boolean
  onClose: () => void
  children: React.ReactNode
}

/** Modal panel for narrow viewports. Content stays inline under the shell's
 * DndContext; closed panels unmount so their controls cannot receive focus.
 * Radix manages the focus trap, nested layers, Escape and background isolation.
 */
export function Drawer({ id, side, open, onClose, children }: DrawerProps) {
  const opener = useRef<HTMLElement | null>(null)
  const positionClass = side === "left" ? "left-16 border-r w-64" : "right-0 border-l w-80"

  return (
    <Dialog.Root open={open} onOpenChange={next => { if (!next) onClose() }}>
      <Dialog.Overlay className="fixed inset-0 z-40 bg-[rgba(0,0,0,0.55)] backdrop-blur-[2px]" />
      <Dialog.Content
        id={id}
        aria-modal="true"
        aria-describedby={undefined}
        className={`fixed top-0 ${positionClass} z-50 h-full max-w-[calc(100vw-4rem)] flex flex-col bg-black-900 border-line shadow-2xl outline-none`}
        onOpenAutoFocus={() => {
          // Triggers live in the shell rather than under this Dialog.Root.
          opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
        }}
        onCloseAutoFocus={event => {
          event.preventDefault()
          if (opener.current?.isConnected) opener.current.focus()
        }}
      >
        <div className="h-11 px-3 flex items-center justify-between gap-2 border-b border-line shrink-0">
          <Dialog.Title className="text-sm text-fg font-sans font-medium">
            {side === "left" ? "Navigation" : "Opened tabs"}
          </Dialog.Title>
          <Dialog.Close aria-label="Close panel" className="h-8 w-8 flex items-center justify-center rounded-md text-fg-muted hover:bg-ink/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <X className="h-4 w-4" />
          </Dialog.Close>
        </div>
        <div className="min-h-0 flex-1 [&>div]:w-full">{children}</div>
      </Dialog.Content>
    </Dialog.Root>
  )
}
