import { useEffect, useState } from "react";
import { useAuthStore } from "~src/store/useAuthStore";
import { useSyncStore } from "~src/store/useSyncStore";
import { exportWorkspace } from "~src/services/exportWorkspace";
import { Button } from "~src/components/ui/button";
import { Label } from "~src/components/ui/label";
import { RadioGroup, RadioGroupItem } from "~src/components/ui/radio-group";
import { cn } from "~src/lib/utils";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogCancel,
} from "~src/components/ui/alert-dialog";

type LocalData = "keep" | "remove";

const CHOICES: { id: LocalData; label: string; detail: string }[] = [
  { id: "keep", label: "Keep tabs on this device", detail: "They stay here, local only. Sign in again to sync them." },
  { id: "remove", label: "Remove tabs from this device", detail: "For a shared computer. Your account keeps what already synced." },
];

/**
 * Sign out (TASK-7). The workspace is local-first, so signing out keeps this
 * device's tabs by default; removing them is a deliberate second choice that
 * keeps the old safeguards (backup download + explicit confirmation).
 */
export function SignOutDialog({ open, onOpenChange }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const logout = useAuthStore(s => s.logout);
  const { dirty, conflictPending, status } = useSyncStore();
  const [localData, setLocalData] = useState<LocalData>("keep");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) { setLocalData("keep"); setConfirmed(false); setNotice(""); setError(""); }
  }, [open]);

  const unsynced = dirty || conflictPending || status === "offline" || status === "error" || status === "syncing";
  const removing = localData === "remove";

  const download = () => {
    try {
      exportWorkspace();
      setError("");
      setNotice("Download requested. Check that the JSON file was saved before signing out. New edits require a new backup.");
    } catch {
      setConfirmed(false);
      setNotice("");
      setError("Could not download your backup. You are still signed in and your workspace is unchanged.");
    }
  };

  const confirm = async () => {
    if ((removing && !confirmed) || busy) return;
    setBusy(true);
    setError("");
    try {
      await logout({ localData });
      onOpenChange(false);
    } catch {
      setError("Sign out did not complete. Please try again.");
    } finally { setBusy(false); }
  };

  return (
    <AlertDialog open={open} onOpenChange={value => { if (!busy) onOpenChange(value); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Sign out of FlexTab?</AlertDialogTitle>
          <AlertDialogDescription>
            Your account keeps everything that already synced. Choose what happens to the tabs on this device.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <RadioGroup value={localData} onValueChange={v => { setLocalData(v as LocalData); setConfirmed(false); }} className="flex flex-col gap-2" disabled={busy}>
          {CHOICES.map(choice => (
            <Label
              key={choice.id}
              htmlFor={`signout-${choice.id}`}
              className={cn(
                "flex cursor-pointer items-start gap-2.5 rounded-lg border px-4 py-2.5 font-normal transition-colors",
                localData === choice.id
                  ? "border-[var(--accent)] bg-[var(--accent-subtle)]"
                  : "border-ink/10 bg-ink/[0.02] hover:bg-ink/[0.05]",
              )}
            >
              <RadioGroupItem value={choice.id} id={`signout-${choice.id}`} className="mt-0.5" />
              <span className="flex flex-col gap-0.5">
                <span className="text-fg text-sm">{choice.label}</span>
                <span className="text-fg-subtle text-xs">{choice.detail}</span>
              </span>
            </Label>
          ))}
        </RadioGroup>
        {removing && (
          <>
            {unsynced && (
              <p className="text-sm text-warning">Your workspace may contain unsynced changes or an unresolved conflict. Download a backup first, or cancel to finish syncing.</p>
            )}
            <Button variant="secondary" disabled={busy} onClick={download}>Download backup</Button>
            {notice && <p role="status" className="text-xs text-fg-muted">{notice}</p>}
            <label className="flex items-start gap-2 text-sm text-fg-muted">
              <input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} />
              I understand that unsynced local changes will be deleted.
            </label>
          </>
        )}
        {!removing && unsynced && (
          <p className="text-xs text-fg-muted">Changes that have not synced stay on this device and sync when you sign in again.</p>
        )}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex flex-col gap-2">
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <Button variant={removing ? "destructive" : "default"} disabled={(removing && !confirmed) || busy} onClick={confirm}>
            {busy ? "Signing out…" : removing ? "Sign out and remove tabs" : "Sign out"}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
