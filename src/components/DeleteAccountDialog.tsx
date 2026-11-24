import { useEffect, useState } from "react";
import { useAuthStore } from "~src/store/useAuthStore";
import { apiGetBillingStatus, ApiError, type BillingStatus } from "~src/services/api";
import { exportWorkspace } from "~src/services/exportWorkspace";
import { navigate } from "~src/lib/route";
import { Input } from "~src/components/ui/input";
import { Modal, ModalBody, ModalCheckbox, ModalFooter, ModalHeader, ModalLink } from "~src/components/ui/modal";
import { TextLink } from "~src/components/ui/text-link";

type LocalData = "keep" | "remove";

const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/**
 * Delete account. The person opening this has already decided, so it
 * says one thing: type the email to delete it for good (the server checks the
 * email too). Tabs on this device stay unless they tick the one option; only
 * then is a backup offered. Paid time that ends is said only when there is any
 * (title, one line, field, one tick, two buttons).
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
        description={<>Type <span className="text-fg">{email}</span> to delete it for good.</>} />
      <ModalBody>
        {paidUntil && (
          <p role="note" className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-warning-body/90 text-xs leading-relaxed">
            <span className="capitalize">{billing!.plan}</span> until {formatDate(paidUntil)} ends now. Paid time isn&apos;t refunded.
          </p>
        )}

        <div className="flex flex-col gap-3">
          {/* Enter may confirm here: the typed email is the safeguard (modal standard §8). */}
          <Input id="confirm-account-email" type="email" aria-label={`Type ${email} to confirm`} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" disabled={busy}
            onKeyDown={(e) => { if (e.key === "Enter") void confirm(); }} />
          <ModalCheckbox checked={localData === "remove"} disabled={busy} onCheckedChange={(on) => setLocalData(on ? "remove" : "keep")}>
            Also remove tabs from this device
          </ModalCheckbox>
        </div>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error.text}{" "}
            {error.toPlan && (
              <TextLink tone="danger" onClick={() => { onOpenChange(false); navigate("/settings/plan"); }}>
                Open Plan &amp; Usage
              </TextLink>
            )}
          </p>
        )}
      </ModalBody>
      <ModalFooter
        start={localData === "remove" ? <ModalLink disabled={busy} onClick={() => exportWorkspace()}>Download backup</ModalLink> : undefined}
        cancelDisabled={busy}
        primary={{ label: busy ? "Deleting…" : "Delete account", tone: "destructive", disabled: !matches || busy, onClick: () => void confirm() }} />
    </Modal>
  );
}
