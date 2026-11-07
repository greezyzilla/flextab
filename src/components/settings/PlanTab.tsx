import { useState, useEffect, useRef } from "react";
import { useAuthStore } from "~src/store/useAuthStore";
import {
  apiGetPlan, apiGetCheckoutUrl, apiGetBillingStatus, ApiError,
  type PlanStatus, type PlanLimits, type BillingStatus,
} from "~src/services/api";
import { Button } from "~src/components/ui/button";
import { Badge } from "~src/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "~src/components/ui/card";
import {
  SettingRow, UsageBar, formatIDR, formatDate, formatBytes,
  PLAN_PRICE_IDR, CONFIRM_POLL_DELAYS,
} from "./shared";

export function PlanTab() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const [status, setStatus] = useState<PlanStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [upgradingPlan, setUpgradingPlan] = useState<'plus' | 'pro' | null>(null);
  const [upgradeError, setUpgradeError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const planRef = useRef<string | undefined>(undefined);

  const refetchBilling = () => {
    apiGetBillingStatus().then(setBilling).catch(() => { /* no billing card */ });
    apiGetPlan().then(s => { setStatus(s); planRef.current = s.plan; setFailed(false); }).catch(() => setFailed(true));
  };

  const handleUpgrade = async (targetPlan: 'plus' | 'pro') => {
    setUpgradingPlan(targetPlan);
    setUpgradeError('');
    try {
      const url = await apiGetCheckoutUrl(targetPlan);
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) {
        setUpgradeError('Upgrades are currently unavailable. Please try again later.');
      } else if (err instanceof ApiError && err.status === 409) {
        setUpgradeError('This account already has an active subscription.');
      } else if (err instanceof ApiError && err.status === 400) {
        setUpgradeError('That plan isn’t available for purchase yet.');
      } else {
        setUpgradeError('Couldn’t start the upgrade. Try again in a moment.');
      }
    } finally {
      setUpgradingPlan(null);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;
    apiGetPlan()
      .then(s => { if (active) { setStatus(s); planRef.current = s.plan; setFailed(false); } })
      .catch(() => { if (active) setFailed(true); });
    // Billing details (renewal, card, portal) — absent for free and comped-Pro
    // accounts, so a failure here just hides the billing card.
    apiGetBillingStatus()
      .then(b => { if (active) setBilling(b); })
      .catch(() => { /* no billing card */ });
    return () => { active = false; };
  }, [isAuthenticated]);

  // The webhook that actually grants the plan lands asynchronously after the
  // checkout tab closes (background.ts stashes the outcome — see the
  // trust-boundary note there and in newtab/index.tsx's toast). Poll with
  // backoff until the resolved plan actually differs from what it was before
  // checkout, rather than a couple of fixed-delay guesses — a webhook that
  // lands late (retry, slow delivery) would otherwise leave the tab showing
  // the old plan until the user manually refreshes.
  useEffect(() => {
    if (!isAuthenticated) return;
    const KEY = 'flextab_billing_result';
    let cancelled = false;

    const poll = (attempt: number, baselinePlan: string | undefined) => {
      if (cancelled) return;
      apiGetPlan()
        .then(s => {
          if (cancelled) return;
          setStatus(s);
          planRef.current = s.plan;
          setFailed(false);
          if (s.plan !== baselinePlan) {
            setConfirming(false);
            apiGetBillingStatus().then(b => { if (!cancelled) setBilling(b); }).catch(() => { /* ok */ });
            return;
          }
          scheduleNext(attempt, baselinePlan);
        })
        .catch(() => scheduleNext(attempt, baselinePlan));
    };
    const scheduleNext = (attempt: number, baselinePlan: string | undefined) => {
      const next = attempt + 1;
      if (next >= CONFIRM_POLL_DELAYS.length) { setConfirming(false); return; }
      setTimeout(() => poll(next, baselinePlan), CONFIRM_POLL_DELAYS[next]);
    };

    const onResult = (result: unknown) => {
      if (result && typeof result === 'object' && (result as { outcome?: unknown }).outcome === 'success') {
        setConfirming(true);
        poll(0, planRef.current);
      }
    };
    try { chrome.storage.local.get(KEY).then(r => onResult(r[KEY])); } catch (_) { /* ok */ }
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes[KEY]?.newValue) onResult(changes[KEY].newValue);
    };
    try { chrome.storage.onChanged.addListener(listener); } catch (_) { /* ok */ }
    return () => {
      cancelled = true;
      try { chrome.storage.onChanged.removeListener(listener); } catch (_) { /* ok */ }
    };
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col gap-7">
        <SettingRow label="Plan & Usage" description="Your plan limits and how much you've used.">
          <Card className="px-5 py-4 text-fg-subtle text-sm font-sans leading-relaxed shadow-none">
            Sign in to see your plan and usage. Tabs on this device have no limit. Syncing them follows your plan's tab limit.
          </Card>
        </SettingRow>
      </div>
    );
  }

  const currentPlan = status?.plan ?? 'free';

  return (
    <div className="flex flex-col gap-7">
      <SettingRow label="Plan" description="FlexTab is in beta, so limits are generous while we're in preview.">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          <PlanCard
            name="Free" price="Free" active={currentPlan === 'free'}
            limits={status?.limits}
          />
          <PlanCard
            name="Plus" price={formatIDR(PLAN_PRICE_IDR.plus) + '/mo'} active={currentPlan === 'plus'}
            limits={status?.plus_limits}
            onUpgrade={currentPlan === 'free' ? () => handleUpgrade('plus') : undefined}
            upgrading={upgradingPlan === 'plus'}
          />
          <PlanCard
            name="Pro" price={formatIDR(PLAN_PRICE_IDR.pro) + '/mo'} active={currentPlan === 'pro'}
            limits={status?.pro_limits}
            onUpgrade={currentPlan !== 'pro' ? () => handleUpgrade('pro') : undefined}
            upgrading={upgradingPlan === 'pro'}
          />
        </div>
        {upgradeError && <div className="text-amber-300/80 text-xs font-sans mt-1.5">{upgradeError}</div>}
        {confirming && <div className="text-fg-subtle text-xs font-sans mt-1.5">Confirming your payment. This can take a few seconds…</div>}
      </SettingRow>

      {billing?.active && (
        <SettingRow label="Billing" description="Your subscription, managed by our payment provider.">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/[0.08] bg-white/[0.02] px-5 py-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-fg-muted text-sm font-sans">
                {billing.status === 'cancelled' && billing.ends_at
                  ? `${currentPlan === 'plus' ? 'Plus' : 'Pro'} until ${formatDate(billing.ends_at)} (won't renew)`
                  : billing.renews_at
                    ? `Renews on ${formatDate(billing.renews_at)}`
                    : 'Active subscription'}
              </span>
              {billing.card_brand && billing.card_last_four && (
                <span className="text-fg-subtle text-xs font-sans capitalize">
                  {billing.card_brand} •••• {billing.card_last_four}
                </span>
              )}
            </div>
            {billing.portal_url && (
              <Button variant="secondary" size="sm" onClick={() => window.open(billing.portal_url, '_blank', 'noopener')}>
                Manage billing
              </Button>
            )}
          </div>
        </SettingRow>
      )}

      <SettingRow label="Usage" description="How much of your plan you're using across this account.">
        {failed && <div className="text-fg-subtle text-xs font-sans">Couldn't load usage.</div>}
        {!failed && !status && <div className="text-fg-subtle text-xs font-sans">Loading…</div>}
        {status && (
          <div className="flex flex-col gap-3">
            <UsageBar label="Total tabs" used={status.usage.total_tabs} cap={status.limits.max_tabs_total} />
            <UsageBar label="Storage" used={status.usage.tree_bytes} cap={status.limits.max_tree_bytes} format={formatBytes} />
            <UsageBar label="Version history" used={status.usage.snapshots} cap={status.limits.max_snapshots} tone="rolling" hint="Restore points kept. The oldest drop off automatically." />
          </div>
        )}
      </SettingRow>
    </div>
  );
}

/** One tier card in the Plan row: name, price, limits, and (if upgradable) a buy button. */
function PlanCard({ name, price, active, limits, onUpgrade, upgrading }: {
  name: string; price: string; active: boolean; limits?: PlanLimits;
  onUpgrade?: () => void; upgrading?: boolean;
}) {
  return (
    <Card className={`flex flex-col gap-0 ${active ? "border-[var(--accent)]/40 bg-[var(--accent)]/[0.06]" : ""}`}>
      <CardHeader className="flex-row items-center gap-1.5 space-y-0 p-3.5 pb-2">
        <CardTitle className="text-sm font-medium">{name}</CardTitle>
        {active && <Badge variant="accent" size="sm" className="font-normal">Current</Badge>}
      </CardHeader>
      <CardContent className="flex flex-col gap-2 p-3.5 pt-0">
        <span className="text-fg-subtle text-xs font-sans">{price}</span>
        {limits && (
          <div className="flex flex-col gap-1 text-[11px] font-sans text-fg-subtle">
            <span>{limits.max_tabs_total === 0 ? "Unlimited tabs" : `${limits.max_tabs_total.toLocaleString()} tabs`}</span>
            <span>{limits.max_tree_bytes === 0 ? "Unlimited storage" : formatBytes(limits.max_tree_bytes)}</span>
            <span>{limits.max_snapshots === 0 ? "Unlimited history" : `${limits.max_snapshots} versions of history`}</span>
          </div>
        )}
      </CardContent>
      {onUpgrade && (
        <CardFooter className="p-3.5 pt-0">
          <Button variant={active ? "secondary" : "default"} size="sm" onClick={onUpgrade} disabled={upgrading} className="w-full">
            {upgrading ? "Opening…" : `Upgrade to ${name}`}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

