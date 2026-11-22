import { CalendarClock, ChartNoAxesColumn, CreditCard } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useAuthStore } from "~src/store/useAuthStore";
import {
  apiGetPlan, apiGetCheckoutUrl, apiGetBillingStatus, ApiError,
  type PlanStatus, type PlanLimits, type BillingStatus,
} from "~src/services/api";
import { Button } from "~src/components/ui/button";
import { toast } from "sonner";
import { BILLING_TOAST_ID } from "~src/hooks/useBackgroundNotices";
import { UsageMeter, formatIDR, formatDate, formatBytes, PLAN_PRICE_IDR, CONFIRM_POLL_DELAYS, SettingsList, SettingsListRow, SettingsNotice, SettingsSection } from "./shared";

export function PlanTab() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const [status, setStatus] = useState<PlanStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [upgradingPlan, setUpgradingPlan] = useState<'plus' | 'pro' | null>(null);
  const [upgradeError, setUpgradeError] = useState('');
  // A payment coming back: 'pending' while polling for the new plan, 'late' when the schedule ran out
  // before the plan changed (TASK-101).
  const [confirm, setConfirm] = useState<'no' | 'pending' | 'late'>('no');
  const planRef = useRef<string | undefined>(undefined);
  // The page's own first plan load, so a payment read from storage before it lands still compares
  // against the plan the user had, not against nothing (TASK-101).
  const firstLoad = useRef<Promise<string | undefined> | null>(null);
  const checkAgain = useRef<() => void>(() => {});

  const refetchBilling = () => {
    apiGetBillingStatus().then(setBilling).catch(() => { /* no billing card */ });
    apiGetPlan().then(s => { setStatus(s); planRef.current = s.plan; setFailed(false); }).catch(() => setFailed(true));
  };

  /** Try again after the usage failed to load: only the plan, the billing card has its own quiet fallback. */
  const retryPlan = () => {
    setFailed(false);
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
    firstLoad.current = apiGetPlan()
      .then(s => { if (active) { setStatus(s); planRef.current = s.plan; setFailed(false); } return s.plan; })
      .catch(() => { if (active) setFailed(true); return undefined; });
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
          // Confirmed once the plan changed to a paid one: a payment never ends on Free, so Free
          // never counts as the change even when the first load failed (TASK-101).
          if (s.plan !== baselinePlan && s.plan !== 'free') {
            setConfirm('no');
            // The finished moment: the plan the user now has and what it adds (TASK-96).
            const cap = s.limits?.max_tabs_total ?? 0;
            toast.success(`You're on ${PLAN_NAME[s.plan] ?? s.plan}`, { id: BILLING_TOAST_ID, description: cap > 0 ? `Up to ${cap.toLocaleString('en-US')} tabs.` : 'No limit on tabs.' });
            apiGetBillingStatus().then(b => { if (!cancelled) setBilling(b); }).catch(() => { /* ok */ });
            return;
          }
          scheduleNext(attempt, baselinePlan);
        })
        .catch(() => scheduleNext(attempt, baselinePlan));
    };
    const scheduleNext = (attempt: number, baselinePlan: string | undefined) => {
      const next = attempt + 1;
      if (next >= CONFIRM_POLL_DELAYS.length) { if (!cancelled) setConfirm('late'); return; }
      setTimeout(() => poll(next, baselinePlan), CONFIRM_POLL_DELAYS[next]);
    };

    // The baseline is the plan before the payment: the one already shown, else the first load's.
    let baseline: string | undefined;
    const start = () => {
      setConfirm('pending');
      const known = planRef.current !== undefined ? Promise.resolve(planRef.current) : (firstLoad.current ?? Promise.resolve(undefined));
      void known.then(plan => { baseline = plan; poll(0, plan); });
    };
    checkAgain.current = () => { setConfirm('pending'); poll(0, baseline); };
    const onResult = (result: unknown) => {
      if (result && typeof result === 'object' && (result as { outcome?: unknown }).outcome === 'success') start();
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
      <SettingsSection title="Plan" icon={CreditCard} subtitle="Your plan and what it includes." notice={<SettingsNotice>Sign in to see your plan and usage. Tabs on this device have no limit. Syncing them follows your plan's tab limit.</SettingsNotice>}>
        {null}
      </SettingsSection>
    );
  }

  const currentPlan = status?.plan ?? 'free';

  return (
    <>
    <SettingsSection
      title="Plan"
      icon={CreditCard}
      subtitle="Your plan and what it includes."
      notice={upgradeError ? <SettingsNotice tone="warning">{upgradeError}</SettingsNotice>
        : confirm === 'pending' ? <SettingsNotice>Confirming your payment. This can take a few seconds…</SettingsNotice>
        : confirm === 'late' ? <SettingsNotice>Your payment is still being confirmed. It can take a few minutes.{' '}
            <Button variant="link" size="inline" onClick={() => checkAgain.current()}>Check again</Button></SettingsNotice>
        : <SettingsNotice>FlexTab is in beta, so limits are generous while we're in preview.</SettingsNotice>}
    >
      {/* Plans side by side so their limits compare line by line (TASK-84 pl2, refs-plans board: 21 of 27
          billing pages). Each card lists its own tier's limits from the server. */}
      <div role="list" aria-label="Plans" className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <PlanCard name="Free" price="Rp0" who="For one browser and a few groups." active={currentPlan === 'free'} limits={status?.free_limits} />
        <PlanCard
          name="Plus" price={formatIDR(PLAN_PRICE_IDR.plus)} who="For people who save a lot." active={currentPlan === 'plus'}
          limits={status?.plus_limits}
          onUpgrade={currentPlan === 'free' ? () => handleUpgrade('plus') : undefined}
          upgrading={upgradingPlan === 'plus'}
        />
        <PlanCard
          name="Pro" price={formatIDR(PLAN_PRICE_IDR.pro)} who="No limits on tabs or storage." active={currentPlan === 'pro'}
          limits={status?.pro_limits}
          onUpgrade={currentPlan !== 'pro' ? () => handleUpgrade('pro') : undefined}
          upgrading={upgradingPlan === 'pro'}
        />
      </div>
    </SettingsSection>

    {/* When the plan renews or ends, apart from the plan cards (TASK-84: "beda konteks"). Only when there
        is something to say: a subscription or a granted plan; Free on its own has none. */}
    {status && (status.granted || billing?.active) && (
      <SettingsSection title="Subscription" icon={CalendarClock} subtitle="When your plan renews or ends.">
        <SettingsList label="Subscription">
          <SettingsListRow
            title={PLAN_NAME[currentPlan] ?? currentPlan}
            meta={subscriptionLine(status, billing)}
            action={!status.granted && billing?.active && billing.portal_url
              ? <Button variant="ghost" size="sm" onClick={() => window.open(billing.portal_url, '_blank', 'noopener')}>Manage billing</Button>
              : undefined}
          />
        </SettingsList>
      </SettingsSection>
    )}

    <SettingsSection title="Usage" icon={ChartNoAxesColumn} subtitle="How much of your plan you use.">
      <SettingsList
        label="Usage"
        failed={failed ? { title: "Couldn't load usage.", says: "Check your connection, then try again.", onRetry: retryPlan } : undefined}
        loading={!status ? { label: "Loading usage" } : undefined}
      >
        {status && <>
          <UsageRow title="Tabs" says="Saved tabs across all your spaces." used={status.usage.total_tabs} cap={status.limits.max_tabs_total} format={n => n.toLocaleString()} />
          <UsageRow title="Storage" says="The size of your saved workspace." used={status.usage.tree_bytes} cap={status.limits.max_tree_bytes} format={formatBytes} />
          <UsageRow title="Version history" says="Restore points. The oldest drop off on their own." used={status.usage.snapshots} cap={status.limits.max_snapshots} format={n => n.toLocaleString()} tone="rolling" />
        </>}
      </SettingsList>
    </SettingsSection>
    </>
  );
}

/**
 * One usage figure (TASK-84): what is counted on the left, the bar on the right with its numbers right under it.
 * An unlimited cap says "Unlimited" in the bar's place and "412 used" under it (TASK-84 u5).
 */
function UsageRow({ title, says, used, cap, format, tone }: { title: string; says: string; used: number; cap: number; format: (n: number) => string; tone?: 'quota' | 'rolling' }) {
  const unlimited = cap === 0;
  return <SettingsListRow title={title} meta={says} action={
    <div className="flex w-32 flex-col gap-1.5 sm:w-40">
      {/* "Unlimited" takes the bar's 6px line so the row keeps the same height and edges as a capped one. */}
      {unlimited
        ? <span className="text-right text-fg font-sans text-xs font-medium leading-[0.375rem]">Unlimited</span>
        : <UsageMeter used={used} cap={cap} tone={tone} />}
      <span className="text-right text-fg-subtle font-sans text-xs tabular-nums">{unlimited ? `${format(used)} used` : `${format(used)} / ${format(cap)}`}</span>
    </div>
  } />;
}

const PLAN_NAME: Record<string, string> = { free: "Free", plus: "Plus", pro: "Pro" };

/**
 * How long the plan lasts (TASK-84): one that renews shows its date (and the card it bills); one that will end
 * counts down; a granted plan says it was granted, with its end or "No end date".
 */
function subscriptionLine(status: PlanStatus, billing: BillingStatus | null) {
  if (status.granted) return `Granted · ${status.granted_until ? endsLine(status.granted_until) : 'No end date'}`;
  if (!billing?.active) return '';
  if (billing.status === 'cancelled' && billing.ends_at) return endsLine(billing.ends_at);
  return (billing.renews_at ? `Renews ${formatDate(billing.renews_at)}` : 'Active subscription')
    + (billing.card_brand && billing.card_last_four ? ` · ${billing.card_brand} •••• ${billing.card_last_four}` : '');
}

/** "Ends in 12 days · Dec 3, 2026", "Ends tomorrow · …" or "Ends today · …" for a plan that will not continue. */
function endsLine(iso: string) {
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  const when = days <= 0 ? 'Ends today' : days === 1 ? 'Ends tomorrow' : `Ends in ${days} days`;
  return `${when} · ${formatDate(iso)}`;
}

/** A plan's card: name, price, who it's for, its limits as aligned lines, then one full-width action. */
function PlanCard({ name, price, who, active, limits, onUpgrade, upgrading }: {
  name: string; price: string; who: string; active: boolean; limits?: PlanLimits;
  onUpgrade?: () => void; upgrading?: boolean;
}) {
  const lines = limits ? [
    ["Tabs", limits.max_tabs_total === 0 ? "Unlimited" : limits.max_tabs_total.toLocaleString()],
    ["Storage", limits.max_tree_bytes === 0 ? "Unlimited" : formatBytes(limits.max_tree_bytes)],
    ["History", limits.max_snapshots === 0 ? "Unlimited" : `${limits.max_snapshots} versions`],
  ] : [];
  return (
    <div role="listitem" aria-label={active ? `${name}, current plan` : name} className="flex flex-col gap-3 rounded-lg bg-row" style={{ padding: "calc(var(--density-py-tab) * 1.75) var(--density-px-tab)" }}>
      <div className="flex flex-col gap-1">
        <div className="flex h-5 items-center text-fg font-sans text-sm">{name}</div>
        <div className="flex items-baseline gap-0.5"><span className="text-fg font-sans text-xl font-semibold tabular-nums">{price}</span><span className="text-fg-subtle font-sans text-xs">/mo</span></div>
      </div>
      {/* Two lines tall, so every card's limits start on the same line. */}
      <p className="min-h-[2.4375rem] text-fg-subtle font-sans text-xs leading-relaxed">{who}</p>
      <dl className="flex flex-1 flex-col gap-1.5 border-t border-ink/[0.08] pt-3">
        {lines.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2 font-sans text-xs"><dt className="text-fg-subtle">{k}</dt><dd className="text-fg tabular-nums">{v}</dd></div>
        ))}
      </dl>
      {onUpgrade ? <Button variant="default" size="sm" className="w-full" onClick={onUpgrade} disabled={upgrading}>{upgrading ? "Opening…" : `Upgrade to ${name}`}</Button>
        : active ? <Button variant="ghost" size="sm" className="w-full" disabled>Current plan</Button>
        : null}
    </div>
  );
}
