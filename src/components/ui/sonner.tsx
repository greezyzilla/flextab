import { Toaster as SonnerToaster, toast } from "sonner";

/** Fire a toast with an Undo action. */
export function showUndoToast(message: string, onUndo: () => void, timeout = 5000, description?: string) {
  toast(message, {
    duration: timeout,
    description,
    action: { label: "Undo", onClick: onUndo },
  });
}

/** Mount once at the app root. */
export function Toaster() {
  return (
    <SonnerToaster
      theme="dark"
      position="bottom-center"
      gap={8}
      toastOptions={{
        classNames: {
          toast:
            "!bg-black-800 !border !border-ink/10 !rounded-lg !text-fg !text-[13px] !font-sans !shadow-[0_12px_40px_-12px_rgba(0,0,0,0.6)]",
          actionButton:
            "!bg-[var(--accent)] hover:!brightness-110 !text-white !rounded-md !px-2.5 !py-1 !text-xs !font-medium",
        },
      }}
    />
  );
}
