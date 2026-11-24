import type { GroupColor } from "~src/types";

/**
 * The optional group colours: the nine colours people already know
 * from Chrome's tab groups, the same ids as chrome.tabGroups.Color. Each is a
 * theme token in style.css (`--group-<id>`), set per theme.
 */
export const GROUP_COLORS: { id: GroupColor; label: string }[] = [
  { id: "grey", label: "Grey" },
  { id: "blue", label: "Blue" },
  { id: "red", label: "Red" },
  { id: "yellow", label: "Yellow" },
  { id: "green", label: "Green" },
  { id: "pink", label: "Pink" },
  { id: "purple", label: "Purple" },
  { id: "cyan", label: "Cyan" },
  { id: "orange", label: "Orange" },
];

const IDS = new Set<string>(GROUP_COLORS.map((c) => c.id));

/** Unknown values (a newer client's colour, a typo in an import) read as no colour. */
export function isGroupColor(v: unknown): v is GroupColor {
  return typeof v === "string" && IDS.has(v);
}

export function groupColorFill(c: GroupColor): string {
  return `var(--group-${c})`;
}

// Chroma per tint step: 100 → 0.06 on the surface, twice that on the edge.
const chroma = (c: GroupColor, perStep: number) => `calc(var(--group-tint) * ${perStep} * var(--group-${c}-k, 1))`;

/**
 * A coloured group's tinted surface: the lightness of `base` (the panel
 * surface by default, an elevated one for a lifted drag card), the colour's
 * hue. `strength` scales the chroma (a drop target leans in harder).
 */
export function groupTintSurface(c: GroupColor, { base = "var(--color-black-900)", strength = 1 } = {}): string {
  return `oklch(from ${base} l ${chroma(c, 0.0006 * strength)} var(--group-${c}-h))`;
}

/** Its edge: the neutral card edge's lightness, a little more chroma. */
export function groupTintEdge(c: GroupColor, strength = 1): string {
  return `oklch(from color-mix(in oklab, hsl(var(--ink)) 12%, var(--color-black-900)) l ${chroma(c, 0.0012 * strength)} var(--group-${c}-h))`;
}
