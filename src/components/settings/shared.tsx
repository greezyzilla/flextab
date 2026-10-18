import { useId, type AriaAttributes, type ReactNode } from "react";
import { Progress } from "~src/components/ui/progress";
import { ToggleGroup as ShadcnToggleGroup, ToggleGroupItem } from "~src/components/ui/toggle-group";

/** Small uppercase section heading used to group settings within a tab. */
export function GroupHeading({ children }: { children: ReactNode }) {
  return <div className="text-white/35 text-[11px] font-medium font-sans uppercase tracking-wider">{children}</div>;
}
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * One "used / cap" row with a progress bar. cap of 0 = unlimited.
 *
 * tone:
 *  - "quota" (default) — filling up is bad (blocks new tabs / sync); goes
 *    amber near the cap, red when full.
 *  - "rolling" — a rolling window that auto-trims the oldest at the cap (e.g.
 *    version history); sitting at 100% is normal, so it stays accent-colored.
 */
export function UsageBar({ label, used, cap, format, tone = 'quota', hint }: {
  label: string; used: number; cap: number;
  format?: (n: number) => string; tone?: 'quota' | 'rolling'; hint?: string;
}) {
  const fmt = format ?? ((n: number) => String(n));
  const unlimited = cap === 0;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / cap) * 100));
  const near = !unlimited && pct >= 80;
  const full = !unlimited && used >= cap;
  const barColor = tone === 'rolling'
    ? 'var(--accent)'
    : full ? '#f87171' : near ? '#fbbf24' : 'var(--accent)';

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-white/60 text-xs font-sans">{label}</span>
        <span className="text-white/40 text-xs font-sans tabular-nums">
          {fmt(used)} {unlimited ? <span className="text-white/25">/ ∞</span> : <span className="text-white/25">/ {fmt(cap)}</span>}
        </span>
      </div>
      {!unlimited ? (
        <Progress
          value={pct}
          className="h-1.5"
          indicatorClassName="bg-transparent"
          indicatorStyle={{ backgroundColor: barColor }}
        />
      ) : (
        <Progress value={0} className="h-1.5" />
      )}
      {hint && <span className="text-white/25 text-[11px] font-sans">{hint}</span>}
    </div>
  );
}

// Display prices only — informational. The actual charge is entirely
// provider/server-determined (see billing.IPaymu/LemonSqueezy.CheckoutURL);
// nothing here is trusted or sent to the backend. IDR since iPaymu is the
// live provider today; update alongside IPAYMU_*_PRICE_IDR if those change.
export const PLAN_PRICE_IDR: Record<'plus' | 'pro', number> = { plus: 59000, pro: 99000 };

export function formatIDR(n: number): string {
  return `Rp${n.toLocaleString('id-ID')}`;
}

// Poll delays (ms) after a checkout success signal, before the plan is
// confirmed to have changed — increasing backoff, ~34s total coverage. Real
// webhook delivery is typically a couple seconds, but this needs to survive
// slower deliveries without the user having to manually refresh the tab.
export const CONFIRM_POLL_DELAYS = [0, 2000, 3000, 5000, 8000, 12000, 4000];

// Settings row: label + description, then the control full-width below. Stacked
// (not two-column) so it works uniformly for everything — sliders, toggles, and
// the wide content rows (device/snapshot lists, usage bars, forms) alike — with
// no floating controls, squished lists, or label/control height mismatch. Rows
// are separated by the parent's gap.
export type SettingControlProps = Pick<AriaAttributes, 'aria-labelledby' | 'aria-describedby'>;

// Render-prop children opt into the row's accessible name and description.
// Plain content rows keep accepting ReactNode without labelling a container.
export function SettingRow({ label, description, children }: {
  label: string;
  description: string;
  children: ReactNode | ((props: SettingControlProps) => ReactNode);
}) {
  const id = useId();
  const controlProps = { 'aria-labelledby': `${id}-label`, 'aria-describedby': `${id}-description` };
  return (
    <div className="flex flex-col gap-2.5">
      <div>
        <div id={controlProps['aria-labelledby']} className="text-white/80 font-sans text-sm font-medium">{label}</div>
        <div id={controlProps['aria-describedby']} className="text-white/35 font-sans text-xs mt-0.5 leading-relaxed">{description}</div>
      </div>
      {typeof children === 'function' ? children(controlProps) : children}
    </div>
  );
}

/** Settings segmented control — shadcn ToggleGroup (single). */
export function ToggleGroup<T extends string>({ value, onChange, options, ...controlProps }: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: ReactNode }[];
} & SettingControlProps) {
  return (
    <ShadcnToggleGroup
      {...controlProps}
      type="single"
      variant="outline"
      size="sm"
      value={value}
      onValueChange={(v) => {
        if (v) onChange(v as T);
      }}
      className="flex flex-wrap justify-start gap-1.5"
    >
      {options.map((opt) => (
        <ToggleGroupItem key={opt.value} value={opt.value} aria-label={opt.label}>
          {opt.icon}
          {opt.label}
        </ToggleGroupItem>
      ))}
    </ShadcnToggleGroup>
  );
}

