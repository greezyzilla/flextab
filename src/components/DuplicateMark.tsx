import { TriangleAlert } from "lucide-react";
import type { DuplicateCorner, DuplicateLabel, DuplicateTone } from "~src/store/useSettingsStore";

/** What both marks say on hover. */
export const DUPLICATE_TIP = "This address is in this group more than once";

/** Duplicate mark colours (TASK-68): soft ribbon fill + text, and the icon. */
export const DUPLICATE_TONE = {
  caution: { ribbon: "bg-caution/[0.10] text-caution", icon: "text-caution" },
  accent: { ribbon: "bg-[color-mix(in_srgb,var(--accent-subtle)_50%,transparent)] text-fg-accent", icon: "text-fg-accent" },
  neutral: { ribbon: "bg-ink/[0.06] text-fg-muted", icon: "text-fg-subtle" },
} as const;

/**
 * A ribbon across one top corner of a saved tab row (TASK-68). It sits in a
 * clip box of its own, so the row itself stays unclipped (menus and rings
 * still show). The row must be `relative` and carry `group`.
 * `copies`: how many tabs in the group share this address.
 */
export function DuplicateRibbon({ copies, tone, corner, label }: { copies: number; tone: DuplicateTone; corner: DuplicateCorner; label: DuplicateLabel }) {
  return (
    <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg">
      {/* On the left the ribbon crosses the favicon slot (the drag handle),
          so it lets the pointer through there. On the right it shares the
          corner with "⋯": it steps aside while "⋯" is hovered, focused or
          open, so the button and its focus ring sit on the plain row. */}
      <span
        title={DUPLICATE_TIP}
        className={`absolute top-[4px] w-16 border-y border-transparent text-center font-sans text-[8px] font-semibold leading-3 tracking-[0.02em] ${corner === "left" ? "-left-[21px] -rotate-45" : "pointer-events-auto -right-[21px] rotate-45 transition-opacity [.group:has([aria-haspopup=menu]:is(:hover,:focus-visible,[data-state=open]))>span>&]:opacity-0"} ${DUPLICATE_TONE[tone].ribbon}`}
      >
        {label === "count" ? `${copies}×` : "DUPE"}
      </span>
    </span>
  );
}

/** A warning triangle on the favicon's bottom-right corner (TASK-68). Goes inside the `relative` favicon slot of a `group` row. */
export function DuplicateIcon({ tone }: { tone: DuplicateTone }) {
  return (
    <span
      title={DUPLICATE_TIP}
      className={`absolute -bottom-[6px] -right-[6px] grid h-[13px] w-[13px] place-items-center ${DUPLICATE_TONE[tone].icon} [filter:drop-shadow(0_0_1px_var(--row))_drop-shadow(0_0_1px_var(--row))] group-hover:[filter:drop-shadow(0_0_1px_var(--row-hover))_drop-shadow(0_0_1px_var(--row-hover))]`}
    >
      <TriangleAlert className="h-[13px] w-[13px]" strokeWidth={2.5} aria-hidden />
    </span>
  );
}
