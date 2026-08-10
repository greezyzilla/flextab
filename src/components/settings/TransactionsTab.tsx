import { useState, useEffect } from "react";
import { useAuthStore } from "~src/store/useAuthStore";
import { apiGetTransactions, type Transaction } from "~src/services/api";
import { Badge } from "~src/components/ui/badge";
import { formatDate, formatIDR } from "./shared";

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
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-5 py-4 text-white/50 text-sm font-sans leading-relaxed">
            Sign in to see your billing history.
          </div>
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
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] divide-y divide-white/[0.06]">
            {txns.map(t => (
              <div key={t.id} className="flex items-center justify-between px-5 py-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-white/70 text-sm font-sans">
                    {TXN_TYPE_LABEL[t.type] ?? t.type} — {t.plan === 'plus' ? 'Plus' : 'Pro'}
                  </span>
                  <span className="text-white/35 text-xs font-sans capitalize">
                    {formatDate(t.created_at)} · via {t.provider} · {t.status}
                  </span>
                </div>
                <span className="text-white/60 text-sm font-sans tabular-nums">
                  {t.amount_idr > 0 ? formatIDR(t.amount_idr) : '—'}
                </span>
              </div>
            ))}
          </div>
        )}
      </SettingRow>
    </div>
  );
}

// Settings row: label + description, then the control full-width below. Stacked
// (not two-column) so it works uniformly for everything — sliders, toggles, and
// the wide content rows (device/snapshot lists, usage bars, forms) alike — with
// no floating controls, squished lists, or label/control height mismatch. Rows
// are separated by the parent's gap.
