import { Toaster as SonnerToaster, toast } from "sonner";
import { useSettingsStore } from "~src/store/useSettingsStore";
import { DoneCheck } from "~src/components/ui/done-check";

/** Fire a toast with an Undo action. */
export function showUndoToast(message: string, onUndo: () => void, timeout = 5000, description?: string) {
  toast(message, {
    duration: timeout,
    description,
    action: { label: "Undo", onClick: onUndo },
  });
}

/**
 * Mount once at the app root. The toaster follows the app's own mode (System / Light / Dark), and
 * every colour comes from the theme tokens, never sonner's built-in palette (TASK-38):
 * - the description is fg-muted (>= 4.5:1 on every surface, one step below the title);
 * - the action is a text button in accent-text (>= 4.74:1 at every hue), like a Material snackbar
 *   action or Gmail's Undo. White on the accent fill measured 3.8-4.0:1.
 */
export function Toaster() {
  const theme = useSettingsStore((s) => s.theme);
  return (
    <SonnerToaster
      theme={theme}
      position="bottom-center"
      gap={8}
      // A success toast is a finished moment: the same self-drawing check as everywhere else (TASK-96).
      icons={{ success: <DoneCheck className="text-success" /> }}
      toastOptions={{
        classNames: {
          toast:
            "!bg-black-800 !border !border-ink/10 !rounded-lg !text-fg !text-item !font-sans !shadow-[0_12px_40px_-12px_rgba(0,0,0,0.6)]",
          description: "!text-fg-muted",
          actionButton:
            "!bg-transparent !text-fg-accent hover:!bg-ink/[0.06] !rounded-md !px-2 !py-1 !text-xs !font-semibold",
        },
      }}
    />
  );
}
