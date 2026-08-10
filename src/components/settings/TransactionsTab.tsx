import { useState, useEffect } from "react";
import { useAuthStore } from "~src/store/useAuthStore";
import { apiGetTransactions, type Transaction } from "~src/services/api";
import { Card } from "~src/components/ui/card";
import { Separator } from "~src/components/ui/separator";
import { formatDate, formatIDR, SettingRow } from "./shared";

const TXN_TYPE_LABEL: Record<string, string> = {
  created: "Purchase",
  updated: "Renewal",
  cancelled: "Cancellation",
};

export function TransactionsTab() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const [txns, setTxns] = useState<Transaction[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;
    apiGetTransactions()
      .then(t => { if (active) { setTxns(t); setFailed(false); } })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col gap-7">
        <SettingRow label="Transactions" description="Your billing history.">
          <Card className="px-5 py-4 text-white/50 text-sm font-sans leading-relaxed shadow-none">
            Sign in to see your billing history.
          </Card>
        </SettingRow>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-7">
      <SettingRow label="Transactions" description="Every purchase, renewal, and cancellation on this account.">
        {failed && <div className="text-white/30 text-xs font-sans">Couldn't load transaction history.</div>}
        {!failed && !txns && <div className="text-white/30 text-xs font-sans">Loading…</div>}
        {txns && txns.length === 0 && <div className="text-white/30 text-xs font-sans">No transactions yet.</div>}
        {txns && txns.length > 0 && (
          <Card className="overflow-hidden shadow-none">
            {txns.map((t, i) => (
              <div key={t.id}>
                {i > 0 && <Separator className="bg-white/[0.06]" />}
                <div className="flex items-center justify-between px-5 py-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-white/70 text-sm font-sans">
                      {TXN_TYPE_LABEL[t.type] ?? t.type} — {t.plan === "plus" ? "Plus" : "Pro"}
                    </span>
                    <span className="text-white/35 text-xs font-sans capitalize">
                      {formatDate(t.created_at)} · via {t.provider} · {t.status}
                    </span>
                  </div>
                  <span className="text-white/60 text-sm font-sans tabular-nums">
                    {t.amount_idr > 0 ? formatIDR(t.amount_idr) : "—"}
                  </span>
                </div>
              </div>
            ))}
          </Card>
        )}
      </SettingRow>
    </div>
  );
}
