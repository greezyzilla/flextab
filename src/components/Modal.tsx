import * as Dialog from "@radix-ui/react-dialog";

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Accessible title. Rendered visually-hidden when the modal shows its own heading. */
  title: string;
  hideTitle?: boolean;
  /** Show the corner ✕ close button. Default true. */
  showClose?: boolean;
  /** Classes for the dialog box (size, bg, border, radius, layout). */
  className?: string;
  children: React.ReactNode;
}

/**
 * Reusable content modal (Radix Dialog — the shadcn pattern). Shares the backdrop,
 * animation, and a11y of ConfirmDialog: focus trap + restoration, scroll lock,
 * Esc / outside-click to dismiss. Use ConfirmDialog (AlertDialog) for destructive
 * confirmations instead.
 */
export function Modal({
  open,
  onOpenChange,
  title,
  hideTitle = true,
  showClose = true,
  className = "",
  children,
}: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dlg-overlay fixed inset-0 z-[90] bg-[rgba(0,0,0,0.66)] backdrop-blur-[8px]" />
        <Dialog.Content
          className={`dlg-content fixed left-1/2 top-1/2 z-[90] -translate-x-1/2 -translate-y-1/2 border border-white/10 bg-black-900 shadow-[0_18px_50px_-16px_rgba(0,0,0,0.6)] outline-none ${className}`}
        >
          <Dialog.Title className={hideTitle ? "sr-only" : undefined}>{title}</Dialog.Title>
          {children}
          {showClose && (
            <Dialog.Close
              aria-label="Close"
              className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-md text-white/40 transition-colors hover:bg-white/10 hover:text-white/80"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M6 18L18 6" />
              </svg>
            </Dialog.Close>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
