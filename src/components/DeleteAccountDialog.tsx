import { useEffect, useState } from "react";
import { useAuthStore } from "~src/store/useAuthStore";
import { apiGetBillingStatus, ApiError, type BillingStatus } from "~src/services/api";
import { exportWorkspace } from "~src/services/exportWorkspace";
import { navigate } from "~src/lib/route";
import { cn } from "~src/lib/utils";
import { Button, buttonVariants } from "~src/components/ui/button";
import { Input } from "~src/components/ui/input";
import { Label } from "~src/components/ui/label";
import { RadioGroup, RadioGroupItem } from "~src/components/ui/radio-group";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "~src/components/ui/alert-dialog";

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
    <AlertDialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete your account?</AlertDialogTitle>
          <AlertDialogDescription>
            This deletes your account and everything FlexTab stores for it: synced spaces, version history, shared links, devices and sign-ins. It can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-col gap-4">
          {paidUntil && (
            <p role="note" className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-warning-body/90 text-xs leading-relaxed">
              <span className="capitalize">{billing!.plan}</span> until {formatDate(paidUntil)} ends now. Paid time isn&apos;t refunded.
            </p>
          )}

          <RadioGroup value={localData} onValueChange={(v) => setLocalData(v as LocalData)} aria-label="Tabs on this device" className="flex flex-col gap-2" disabled={busy}>
            {CHOICES.map((choice) => (
              <Label
                key={choice.id}
                htmlFor={`delete-account-${choice.id}`}
                className={cn(
                  "flex cursor-pointer items-start gap-2.5 rounded-lg border px-4 py-2.5 font-normal transition-colors",
                  localData === choice.id ? "border-[var(--accent)] bg-[var(--accent-subtle)]" : "border-ink/10 bg-ink/[0.02] hover:bg-ink/[0.05]",
                )}
              >
                <RadioGroupItem value={choice.id} id={`delete-account-${choice.id}`} className="mt-0.5" />
                <span className="flex flex-col gap-0.5">
                  <span className="text-fg text-sm">{choice.label}</span>
                  <span className="text-fg-subtle text-xs">{choice.detail}</span>
                </span>
              </Label>
            ))}
          </RadioGroup>

          <Button variant="link" size="sm" className="self-start !px-0" onClick={() => exportWorkspace()} disabled={busy}>
            Download your tabs first
          </Button>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirm-account-email">Type <span className="text-fg">{email}</span> to confirm</Label>
            <Input id="confirm-account-email" type="email" placeholder="Type your email" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className="w-full" disabled={busy}
              onKeyDown={(e) => { if (e.key === "Enter") void confirm(); }} />
          </div>

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
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy} className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>Cancel</AlertDialogCancel>
          <Button variant="destructive" size="sm" disabled={!matches || busy} onClick={() => void confirm()}>
            {busy ? "Deleting…" : "Delete account"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
