import { Receipt } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useAuthStore } from "~src/store/useAuthStore";
import { apiGetTransactions, type Transaction } from "~src/services/api";
import { formatDate, formatIDR, SettingsList, SettingsListRow, SettingsNotice, SettingsSection } from "./shared";

const TXN_TYPE_LABEL: Record<string, string> = {
  created: "Purchase",
  updated: "Renewal",
  cancelled: "Cancellation",
};

export function TransactionsTab() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const [txns, setTxns] = useState<Transaction[] | null>(null);
  const [failed, setFailed] = useState(false);

  const alive = useRef(true);
  const load = () => {
    setTxns(null);
    setFailed(false);
    apiGetTransactions()
      .then(t => { if (alive.current) { setTxns(t); setFailed(false); } })
      .catch(() => { if (alive.current) setFailed(true); });
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    alive.current = true;
    load();
    return () => { alive.current = false; };
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <SettingsSection title="Payment history" icon={Receipt} subtitle="Your past payments and receipts." notice={<SettingsNotice>Sign in to see your billing history.</SettingsNotice>}>
        {null}
      </SettingsSection>
    );
  }

  return (
    <SettingsSection title="Payment history" icon={Receipt} subtitle="Your past payments and receipts.">
      <SettingsList
        label="Payments"
        failed={failed ? { title: "Couldn't load transaction history.", says: "Check your connection, then try again.", onRetry: load } : undefined}
        loading={!txns ? { label: "Loading payments", rows: 2 } : undefined}
        empty={txns?.length === 0 ? { title: "No transactions yet", says: "Purchases and renewals show up here." } : undefined}
      >
        {txns?.map(t => (
          <SettingsListRow
            key={t.id}
            title={`${TXN_TYPE_LABEL[t.type] ?? t.type} · ${t.plan === "plus" ? "Plus" : "Pro"}`}
            meta={<span className="capitalize">{formatDate(t.created_at)} · via {t.provider} · {t.status}</span>}
            action={<span className="text-fg text-sm font-sans tabular-nums">{t.amount_idr > 0 ? formatIDR(t.amount_idr) : "Free"}</span>}
          />
        ))}
      </SettingsList>
    </SettingsSection>
  );
}
