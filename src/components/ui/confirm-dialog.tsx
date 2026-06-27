import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { Button } from "./button";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Style the confirm button as destructive (red). Default true. */
  destructive?: boolean;
  onConfirm: () => void;
}

/**
 * Accessible confirmation dialog (Radix AlertDialog — the shadcn pattern).
 * Gives focus trap + restoration, scroll lock, Esc to dismiss, role="alertdialog"
 * with proper labelling, and default focus on Cancel. An alert dialog does NOT
 * close on outside click, so a destructive action is never dismissed by accident.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  destructive = true,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay
          onClick={() => onOpenChange(false)}
          className="dlg-overlay fixed inset-0 z-[100] bg-[rgba(0,0,0,0.66)] backdrop-blur-[8px]"
        />
        <AlertDialog.Content className="dlg-content fixed left-1/2 top-1/2 z-[100] w-[calc(100%-3rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-white/10 bg-black-900 p-5 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.5)] outline-none">
          <AlertDialog.Title className="text-sm font-semibold text-white">{title}</AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-[13px] leading-relaxed text-white/55">
            {message}
          </AlertDialog.Description>
          <div className="mt-5 flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button variant="ghost" size="sm">{cancelLabel}</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button variant={destructive ? "destructive" : "default"} size="sm" onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
