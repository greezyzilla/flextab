import { useEffect, useState } from "react";
import { useAuthStore } from "~src/store/useAuthStore";
import { apiGetBillingStatus, ApiError, type BillingStatus } from "~src/services/api";
import { exportWorkspace } from "~src/services/exportWorkspace";
import { navigate } from "~src/lib/route";
import { Input } from "~src/components/ui/input";
import { RadioGroup } from "~src/components/ui/radio-group";
import { Modal, ModalBody, ModalField, ModalFooter, ModalHeader, ModalLink, ModalOptionCard } from "~src/components/ui/modal";

type LocalData = "keep" | "remove";

const CHOICES: { id: LocalData; label: string; detail: string }[] = [
  { id: "keep", label: "Keep tabs on this device", detail: "They stay here, local only." },
  { id: "remove", label: "Remove tabs from this device too", detail: "Nothing of FlexTab stays on this computer." },
];

const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/**
 * Delete account (TASK-17). It can't be undone, so the dialog says what goes,
 * what paid time is lost, offers a download first, and asks for the account's
 * email (the server checks it too). Like sign-out, the tabs on this device
 * stay unless the person asks for them to go (local-first).
 */
export function DeleteAccountDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const user = useAuthStore((s) => s.user);
  const deleteAccount = useAuthStore((s) => s.deleteAccount);
  const [typed, setTyped] = useState("");
  const [localData, setLocalData] = useState<LocalData>("keep");
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; toPlan?: boolean } | null>(null);

  useEffect(() => {
    if (!open) return;
    setTyped(""); setLocalData("keep"); setError(null); setBilling(null);
    apiGetBillingStatus().then(setBilling).catch(() => setBilling(null));
  }, [open]);

  const email = user?.email ?? "";
  const matches = email !== "" && typed.trim().toLowerCase() === email.toLowerCase();
  // Paid time that ends with the account (iPaymu has no refund path here).
  const paidUntil = billing?.active && billing.plan !== "free" && billing.ends_at ? billing.ends_at : null;

  const confirm = async () => {
    if (!matches || busy) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAccount(typed.trim(), { localData });
      onOpenChange(false);
      navigate("/");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError({ text: "Your subscription renews. Cancel it first, then delete your account.", toPlan: true });
      } else {
        setError({ text: "Your account was not deleted. Please try again." });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal kind="alert" size="m" open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <ModalHeader title="Delete your account?"
        description={<>This deletes your account and everything FlexTab stores for it: synced spaces, version history, shared links, devices and sign-ins. It can&apos;t be undone.</>} />
      <ModalBody>
        {paidUntil && (
          <p role="note" className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-warning-body/90 text-xs leading-relaxed">
            <span className="capitalize">{billing!.plan}</span> until {formatDate(paidUntil)} ends now. Paid time isn&apos;t refunded.
          </p>
        )}

        <RadioGroup value={localData} onValueChange={(v) => setLocalData(v as LocalData)} aria-label="Tabs on this device" disabled={busy}>
          {CHOICES.map((choice) => (
            <ModalOptionCard key={choice.id} id={`delete-account-${choice.id}`} value={choice.id} selected={localData === choice.id}
              title={choice.label} hint={choice.detail} danger={choice.id === "remove"} disabled={busy} />
          ))}
        </RadioGroup>

        <ModalField htmlFor="confirm-account-email" label={<>Type <span className="text-fg">{email}</span> to confirm</>}>
          {/* Enter may confirm here: the typed email is the safeguard (modal standard §8). */}
          <Input id="confirm-account-email" type="email" placeholder="Type your email" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className="w-full" disabled={busy}
            onKeyDown={(e) => { if (e.key === "Enter") void confirm(); }} />
        </ModalField>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error.text}{" "}
            {error.toPlan && (
              <button type="button" className="underline underline-offset-2 hover:text-danger-strong" onClick={() => { onOpenChange(false); navigate("/settings/plan"); }}>
                Open Plan &amp; Usage
              </button>
            )}
          </p>
        )}
      </ModalBody>
      <ModalFooter
        start={<ModalLink disabled={busy} onClick={() => exportWorkspace()}>Download your tabs first</ModalLink>}
        cancelDisabled={busy}
        primary={{ label: busy ? "Deleting…" : "Delete account", tone: "destructive", disabled: !matches || busy, onClick: () => void confirm() }} />
    </Modal>
  );
}
