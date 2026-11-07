import { useEffect, useState } from "react";
import { useAuthStore } from "~src/store/useAuthStore";
import { useSyncStore } from "~src/store/useSyncStore";
import { exportWorkspace } from "~src/services/exportWorkspace";
import { Button } from "~src/components/ui/button";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogCancel,
} from "~src/components/ui/alert-dialog";

export function SignOutDialog({ open, onOpenChange }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const logout = useAuthStore(s => s.logout);
  const { dirty, conflictPending, status } = useSyncStore();
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (open) { setConfirmed(false); setNotice(""); setError(""); }
  }, [open]);

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
    if (!confirmed || busy) return;
    setBusy(true);
    setError("");
    try {
      await logout({ discardLocalData: true });
      onOpenChange(false);
    } catch {
      setError("Sign out did not complete. Please try again.");
    } finally { setBusy(false); }
  };

  return (
    <AlertDialog open={open} onOpenChange={value => { if (!busy) onOpenChange(value); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Sign out and remove local data?</AlertDialogTitle>
          <AlertDialogDescription>
            Signing out removes this device’s local workspace. Changes that have not reached your account will be permanently lost. Your existing cloud data stays in your account.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {(dirty || conflictPending || status === "offline" || status === "error" || status === "syncing") && (
          <p className="text-sm text-amber-300">Your workspace may contain unsynced changes or an unresolved conflict. Download a backup first, or cancel to finish syncing.</p>
        )}
        <Button variant="secondary" disabled={busy} onClick={download}>Download backup</Button>
        {notice && <p role="status" className="text-xs text-fg-muted">{notice}</p>}
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        <label className="flex items-start gap-2 text-sm text-fg-muted">
          <input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} />
          I understand that unsynced local changes will be deleted.
        </label>
        <div className="flex flex-col gap-2">
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <Button variant="destructive" disabled={!confirmed || busy} onClick={confirm}>
            {busy ? "Signing out…" : "Sign out and delete local data"}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
