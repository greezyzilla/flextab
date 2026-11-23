import { createContext, useContext, useId, type AriaAttributes, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Icon } from "~src/components/ui/icon";
import { Skeleton } from "~src/components/ui/skeleton";
import { Info, TriangleAlert } from "lucide-react";
import { Button, IconButton } from "~src/components/ui/button";
import { Progress } from "~src/components/ui/progress";
import { ToggleGroup as ShadcnToggleGroup, ToggleGroupItem } from "~src/components/ui/toggle-group";

/**
 * Settings has ONE design language (TASK-84, docs/settings-standard.md). Every
 * sub-setting is built from this closed set of parts and nothing else:
 *
 *   SettingsSection  a group: its title, an optional notice, then rows or one list
 *   SettingRow       something you change: text left, control in one right column
 *   SettingsList     things you look at (devices, versions, payments, ways in),
 *   SettingsListRow  one panel with a line between items
 *   SettingsNotice   a note or warning, always in the same place and shape
 *
 * A section holds setting rows or one list, never both, so "what I change" and
 * "what I look at" never share a shape. A new need changes values here; it
 * never adds a part (settings-standard.test.ts holds the line).
 */
/** True inside a section drawn as a header bar + group card: its rows render as tiles. */
const TileRows = createContext(false);

/** The section's own mark, so a list's empty block can show what the list is about. */
const SectionMark = createContext<LucideIcon | null>(null);

/** A tile's padding: the tab row's, 14px top and bottom (py-tab x 1.75, spacing s2). */
export const TILE_PADDING = "calc(var(--density-py-tab) * 1.75) var(--density-px-tab)";

export function SettingsSection({ title, icon, subtitle, notice, children }: {
  title: string;
  /** The section's mark in the header box (icon-standard.md, "Settings sections"). */
  icon: LucideIcon;
  /** One short line under the title: what the section is for. */
  subtitle: string;
  /** A SettingsNotice shown under the header, before the rows. */
  notice?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  return (
    // TASK-84, approved h13d + spacing s2 (h14d2): one group card per section, its header inside the card.
    // One padding (the card's) on every side of the header box; the box lines up with the tiles' edge.
    <section aria-labelledby={id} data-look="card" className="flex flex-col rounded-card border border-ink/[0.08] bg-ink/[0.015]"
      style={{ padding: "var(--density-p-group)", gap: "calc(var(--density-p-group) * 4 / 3)" }}>
      <div className="flex min-w-0 items-center gap-3">
        <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ink/[0.08] text-fg">
          <Icon icon={icon} size="md" />
        </span>
        <div className="flex min-w-0 flex-col">
          <h3 id={id} className="truncate text-fg font-sans text-base font-semibold leading-6">{title}</h3>
          <p className="truncate text-fg-subtle font-sans text-xs leading-4">{subtitle}</p>
        </div>
      </div>
      {notice}
      {/* Tiles 10px apart (gap-group x 5/3). */}
      <div className="flex flex-col" style={{ gap: "calc(var(--density-gap-group) * 5 / 3)" }}>
        <SectionMark.Provider value={icon}><TileRows.Provider value>{children}</TileRows.Provider></SectionMark.Provider>
      </div>
    </section>
  );
}

/** A settings page: its sections, stacked 48px apart. A page made of other
 * pages (Sync & backup, Saving & opening) nests them and keeps the same gap. */
export function SettingsPage({ children }: { children: ReactNode }) {
  // Section cards sit 40px apart (spacing s2).
  return <div className="flex flex-col gap-10">{children}</div>;
}

/** What a list says when it can't show items: a short title and one sentence. */
export type SettingsListState = { title: string; says: string };

/** Things to look at, in one panel: one line between items, never a box per item. */
export function SettingsList({ label, busyLabel, loading, failed, empty, children }: {
  /** Accessible name of the list. */
  label: string;
  /** While the caller draws its own placeholder rows: the list becomes a status with this name. */
  busyLabel?: string;
  /** While the items load: skeleton rows shaped like a real row (TASK-84, refs-states board), so nothing jumps. */
  loading?: { label: string; rows?: number };
  /** Loading failed: a centred block with Try again (every reference offers a retry). */
  failed?: SettingsListState & { onRetry: () => void };
  /** Nothing to list: a centred block that says what will appear here and when. */
  empty?: SettingsListState;
  children?: ReactNode;
}) {
  const tile = useContext(TileRows);
  const busy = busyLabel ?? (failed ? undefined : loading?.label);
  const body = failed ? <ListBlock tone="failed" {...failed} action={<Button variant="ghost" size="sm" onClick={failed.onRetry}>Try again</Button>} />
    : loading ? Array.from({ length: loading.rows ?? 3 }, (_, i) => <SkeletonRow key={i} />)
    : empty ? <ListBlock tone="empty" {...empty} />
    : children;
  if (tile) return (
    // In a section card the items are tiles like its setting rows (the group card's own rows), never a box in a box.
    <ul aria-label={busy ?? label} role={busy ? "status" : undefined} aria-busy={busy ? true : undefined} className="flex flex-col" style={{ gap: "calc(var(--density-gap-group) * 5 / 3)" }}>
      {body}
    </ul>
  );
  return (
    <div className="py-2">
      <ul aria-label={busy ?? label} role={busy ? "status" : undefined} aria-busy={busy ? true : undefined} className="flex flex-col divide-y divide-line rounded-lg border border-line">
        {body}
      </ul>
    </div>
  );
}

/** A loading stand-in: a real SettingsListRow with bars at the height of its title and its one line of facts. */
function SkeletonRow() {
  return (
    <SettingsListRow placeholder
      title={<Skeleton line={20} width={112} height={14} />}
      meta={<Skeleton line="1.21875rem" width={160} height={12} tone="faint" />} />
  );
}

/**
 * A list's failed or empty state, centred in the list's own area (TASK-84 st2). The mark sits in its own box
 * so an illustration can take that one slot later without moving anything else.
 */
function ListBlock({ tone, title, says, action }: SettingsListState & { tone: "failed" | "empty"; action?: ReactNode }) {
  const mark = useContext(SectionMark);
  const glyph = tone === "failed" ? TriangleAlert : mark;
  return (
    <li className="flex flex-col items-center gap-3 rounded-lg bg-row px-6 py-8 text-center">
      {glyph && (
        <span aria-hidden data-slot="list-state-art" className={`flex h-10 w-10 items-center justify-center rounded-lg bg-ink/[0.08] ${tone === "failed" ? "text-danger" : "text-fg"}`}>
          <Icon icon={glyph} size="md" />
        </span>
      )}
      <div role={tone === "failed" ? "alert" : undefined} className="flex flex-col gap-0.5">
        <p className="text-fg font-sans text-sm font-medium">{title}</p>
        <p className="text-fg-subtle font-sans text-xs leading-relaxed">{says}</p>
      </div>
      {action}
    </li>
  );
}

/**
 * One item of a SettingsList: an optional mark (only for a brand the user
 * knows, like a sign-in provider), its name, one line of facts, and quiet
 * actions on the right.
 */
export function SettingsListRow({ mark, title, meta, action, placeholder = false }: {
  mark?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  /** A stand-in while the list loads: hidden from assistive tech, same height as a real row. */
  placeholder?: boolean;
}) {
  const tile = useContext(TileRows);
  return (
    <li data-slot="settings-list-row" data-placeholder={placeholder || undefined} aria-hidden={placeholder || undefined}
      className={tile ? "flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-lg bg-row" : "flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3"}
      style={tile ? { padding: TILE_PADDING } : undefined}>
      <div className="flex min-w-0 flex-1 basis-48 items-center gap-3">
        {mark && <span aria-hidden className="flex h-5 w-5 shrink-0 items-center justify-center">{mark}</span>}
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-fg font-sans text-sm">{title}</div>
          {meta && <div className="min-w-0 text-fg-subtle font-sans text-xs leading-relaxed">{meta}</div>}
        </div>
      </div>
      {action && <div className="flex shrink-0 items-center gap-1.5">{action}</div>}
    </li>
  );
}

/** A note on a section (why something is off, what signing in adds). One shape everywhere. */
export function SettingsNotice({ tone = 'info', children }: { tone?: 'info' | 'warning'; children: ReactNode }) {
  return (
    <p role="note" className={`rounded-lg px-4 py-3 font-sans text-xs leading-relaxed ${tone === 'warning'
      ? 'border border-amber-500/25 bg-amber-500/10 text-warning-body'
      : 'bg-ink/[0.04] text-fg-muted'}`}>
      {children}
    </p>
  );
}

/** A usage meter, used as a SettingRow's control (the row says the numbers). */
export function UsageMeter({ used, cap, tone = 'quota' }: { used: number; cap: number; tone?: 'quota' | 'rolling' }) {
  const unlimited = cap === 0;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / cap) * 100));
  const barColor = tone === 'rolling' ? 'var(--accent)' : used >= cap && !unlimited ? 'rgb(var(--danger))' : pct >= 80 ? 'rgb(var(--warning))' : 'var(--accent)';
  return <Progress value={pct} aria-hidden size="sm" indicatorClassName="bg-transparent" indicatorStyle={{ backgroundColor: barColor }} />;
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
    : full ? 'rgb(var(--danger))' : near ? 'rgb(var(--warning))' : 'var(--accent)';

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-fg-muted text-xs font-sans">{label}</span>
        <span className="text-fg-subtle text-xs font-sans tabular-nums">
          {fmt(used)} {unlimited ? <span className="text-fg-subtle">/ ∞</span> : <span className="text-fg-subtle">/ {fmt(cap)}</span>}
        </span>
      </div>
      {!unlimited ? (
        <Progress
          value={pct}
          size="sm"
          indicatorClassName="bg-transparent"
          indicatorStyle={{ backgroundColor: barColor }}
        />
      ) : (
        <Progress value={0} size="sm" />
      )}
      {hint && <span className="text-fg-subtle text-caption font-sans">{hint}</span>}
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

export type SettingControlProps = Pick<AriaAttributes, 'aria-labelledby' | 'aria-describedby'>;

/**
 * Something you change. The same two columns on every page: what it is on the
 * left, the control on the right, every control starting at the same x so the
 * eye reads one column of controls down the page (narrow windows stack them).
 * Render-prop children opt into the row's accessible name and description.
 */
export function SettingRow({ label, description, info, children }: {
  label: string;
  /** One short line. Anything longer goes in `info`. */
  description: string;
  /** The longer explanation: an info mark beside the label shows it on hover or keyboard focus,
   *  and screen readers get it as part of the control's description. */
  info?: string;
  children: ReactNode | ((props: SettingControlProps) => ReactNode);
}) {
  const id = useId();
  const tile = useContext(TileRows);
  // The row shows one sentence. Anything after it joins the info mark (TASK-84: "deskripsi kalo panjang
  // dijadiin info, yang di row tetep pendek"), so a page can't put a paragraph in a row.
  const cut = description.search(/[.!?]\s+\S/);
  if (cut > 0) {
    const rest = description.slice(cut + 1).trim();
    description = description.slice(0, cut + 1);
    info = info ? `${rest} ${info}` : rest;
  }
  const controlProps = { 'aria-labelledby': `${id}-label`, 'aria-describedby': `${id}-description` };
  return (
    <div
      className={tile
        // 16rem input column; a row of fitted choices wider than that widens it instead of wrapping (TASK-84).
        // A field here is the one field look (ui/input: no fill, ink/25 edge), so it adds no layer to the tile.
        ? "flex flex-col gap-3 rounded-lg bg-row md:grid md:grid-cols-[minmax(0,1fr)_minmax(16rem,max-content)] md:items-center md:gap-x-6"
        : "flex flex-col gap-3 py-4 md:grid md:grid-cols-[minmax(0,1fr)_22rem] md:items-center md:gap-x-6"}
      // A tile: the tab row's padding, 14px top and bottom (py-tab x 1.75, spacing s2).
      style={tile ? { padding: TILE_PADDING } : undefined}>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <div id={controlProps['aria-labelledby']} className="text-fg font-sans text-sm font-medium">{label}</div>
          {info && (
            <IconButton variant="subtle" size="xs" className="shrink-0" aria-label={`About ${label}`} tooltip={info}>
              <Icon icon={Info} size="sm" />
            </IconButton>
          )}
        </div>
        <div id={controlProps['aria-describedby']} className="text-fg-subtle font-sans text-xs mt-0.5 leading-relaxed">
          {description}{info ? " " : null}{info && <span className="sr-only">{info}</span>}
        </div>
      </div>
      {/* In a card (TASK-84, h13d): controls sit on the right edge like the draft; sliders keep the full column. */}
      {/* In a card a control that is only as wide as its content (a button, a switch with its On/Off, Move up/down)
          sits on the right edge; one that fills the column (field, slider, choices, a row of dots) keeps filling it. */}
      {/* A message in the column (an error, a done line: role status or alert) adds no width to it,
          so it wraps under the controls instead of pushing the label to one letter a line (TASK-122). */}
      <div className={tile
        ? "flex min-w-0 flex-col items-stretch gap-2 [&>button]:self-end [&>div.flex:not(.justify-between)]:justify-end [&>[role=status]]:[contain:inline-size] [&>[role=alert]]:[contain:inline-size]"
        : "flex min-w-0 flex-col items-stretch gap-2 [&>button]:self-start"}>
        {typeof children === 'function' ? children(controlProps) : children}
      </div>
    </div>
  );
}

/** Settings segmented control — shadcn ToggleGroup (single). */
export function ToggleGroup<T extends string>({ value, onChange, options, ...controlProps }: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: ReactNode }[];
} & SettingControlProps) {
  const tile = useContext(TileRows);
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
      // In a card each option is as wide as its own content and the group sits on the column's right edge
      // (TASK-84: "fit rata kanan"); forcing equal shares made every row's buttons a different forced size.
      arrange={tile ? "end" : "wrap"}
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

