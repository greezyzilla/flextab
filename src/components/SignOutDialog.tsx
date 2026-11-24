import { useEffect, useState } from "react";
import { useAuthStore } from "~src/store/useAuthStore";
import { useSyncStore } from "~src/store/useSyncStore";
import { exportWorkspace } from "~src/services/exportWorkspace";
import { RadioGroup } from "~src/components/ui/radio-group";
import { Modal, ModalBody, ModalCheckbox, ModalFooter, ModalGroup, ModalHeader, ModalLink, ModalOptionCard } from "~src/components/ui/modal";

type LocalData = "keep" | "remove";

const CHOICES: { id: LocalData; label: string; detail: string }[] = [
  { id: "keep", label: "Keep tabs on this device", detail: "They sync again when you sign in." },
  { id: "remove", label: "Remove tabs from this device", detail: "For a shared computer." },
];

/**
 * Sign out. The workspace is local-first, so signing out keeps this
 * device's tabs by default; removing them is a deliberate second choice that
 * keeps the backup download, and asks for explicit consent only when changes
 * that never reached the account would be lost (one line, two choices,
 * two buttons; the confirm carries the danger).
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
  // Consent only when something that is not on the account would be lost.
  const needsConsent = removing && unsynced;

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
    if ((needsConsent && !confirmed) || busy) return;
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
    <Modal kind="alert" size="m" open={open} onOpenChange={value => { if (!busy) onOpenChange(value); }}>
      <ModalHeader title="Sign out of FlexTab?"
        description="Your account keeps what already synced." />
      <ModalBody>
        <RadioGroup value={localData} onValueChange={v => { setLocalData(v as LocalData); setConfirmed(false); }} disabled={busy}>
          {CHOICES.map(choice => (
            <ModalOptionCard key={choice.id} id={`signout-${choice.id}`} value={choice.id} selected={localData === choice.id}
              title={choice.label}
              hint={choice.id === "remove" && unsynced ? <span className="text-warning">Changes not synced yet are lost too.</span> : choice.detail} disabled={busy} />
          ))}
        </RadioGroup>
        {removing && (notice || needsConsent) && (
          <ModalGroup>
            {notice && <p role="status" className="text-xs text-fg-muted">{notice}</p>}
            {needsConsent && (
              <ModalCheckbox checked={confirmed} disabled={busy} onCheckedChange={setConfirmed}>
                Lose the changes not synced yet
              </ModalCheckbox>
            )}
          </ModalGroup>
        )}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </ModalBody>
      <ModalFooter
        quiet
        start={removing ? <ModalLink disabled={busy} onClick={download}>Download backup</ModalLink> : undefined}
        cancelDisabled={busy}
        primary={{
          label: busy ? "Signing out…" : "Sign out",
          tone: removing ? "destructive" : "primary",
          disabled: (needsConsent && !confirmed) || busy,
          onClick: () => void confirm(),
        }} />
    </Modal>
  );
}
