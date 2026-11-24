/// <reference types="vite/client" />
// Contrast guard (TASK-68), run in a real browser: the colour tokens use oklch
// relative colours, color-mix and translucent fills over tinted surfaces, which
// only a rendering engine resolves. Rule: every Badge variant and every
// duplicate mark reads at >= 4.5:1 (WCAG 1.4.3) against what it actually sits
// on, in light and dark, at every accent hue (step 10) x colour intensity
// (step 25) x group tint, on every surface it can appear on, and in its hover
// state. A new or edited variant or mark tone cannot ship below it.
import "~/style.css";
import type { CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Badge, badgeVariants } from "~src/components/ui/badge";
import badgeSource from "~src/components/ui/badge.tsx?raw";
import { DUPLICATE_TONE, DuplicateIcon, DuplicateRibbon } from "~src/components/ui/duplicate-mark";
import { TooltipProvider } from "~src/components/ui/tooltip";
import { GROUP_COLORS, groupTintSurface } from "~src/lib/groupColors";
import type { GroupColor } from "~src/types";

// The mark's icon reads its stroke weight from the settings store, which
// listens to chrome.storage; this page has no extension APIs.
vi.mock("~src/store/useSettingsStore", () => ({
  useSettingsStore: (pick: (s: { iconWeight: "regular" }) => unknown) => pick({ iconWeight: "regular" }),
}));

const MIN = 4.5;
const HUES = Array.from({ length: 36 }, (_, i) => i * 10);
const INTENSITIES = [0, 25, 50, 75, 100];
const GROUP_TINTS = [0, 35, 100];

// Every variant in badge.tsx, read from the source so a new one is measured too.
const variantBlock = badgeSource.slice(badgeSource.indexOf("variant: {"), badgeSource.indexOf("size: {"));
const VARIANTS = [...variantBlock.matchAll(/^\s+(\w+):\s*\n?\s*"/gm)].map((m) => m[1]);
const TONES = Object.keys(DUPLICATE_TONE) as (keyof typeof DUPLICATE_TONE)[];

// sRGB relative luminance and contrast ratio (WCAG 2.x).
const lum = ([r, g, b]: number[]) => {
  const f = (v: number) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a: number[], b: number[]) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

// The browser composites each fill over the one below; a 1px canvas does the
// same with the computed colours, from the root down to the element.
const canvas = document.createElement("canvas");
canvas.width = canvas.height = 1;
const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
const pixel = () => [...ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)];
function colours(el: Element, extra?: (fill: string) => void) {
  const chain: Element[] = [];
  for (let n: Element | null = el; n; n = n.parentElement) chain.unshift(n);
  ctx.globalAlpha = 1; ctx.filter = "none";
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 1, 1);
  for (const n of chain) { ctx.fillStyle = getComputedStyle(n).backgroundColor; ctx.fillRect(0, 0, 1, 1); }
  extra?.(getComputedStyle(el).backgroundColor);
  const bg = pixel();
  ctx.fillStyle = getComputedStyle(el).color; ctx.fillRect(0, 0, 1, 1);
  return { bg, fg: pixel() };
}

type Probe = { name: string; el: HTMLElement; hover?: (el: HTMLElement) => number };

/** A badge's hover state, read from its own classes: a fill that fades (hover:bg-x/NN) or a brightness filter. */
function badgeHover(variant: string) {
  const cls = badgeVariants({ variant: variant as never });
  const fade = cls.match(/hover:bg-[\w-]+\/(\d+)/);
  const bright = cls.match(/hover:brightness-(?:(\d+)|\[var\((--[\w-]+)\)\])/);
  if (!fade && !bright) return undefined;
  return (el: HTMLElement) => {
    if (fade) {
      const a = Number(fade[1]) / 100;
      const under = colours(el.parentElement!).bg;
      const { fg } = colours(el);
      const fill = getComputedStyle(el).backgroundColor.match(/[\d.]+/g)!.slice(0, 3).map(Number);
      return ratio(fg, fill.map((x, k) => a * x + (1 - a) * under[k]));
    }
    const k = bright![1] ? Number(bright![1]) / 100 : parseFloat(getComputedStyle(document.documentElement).getPropertyValue(bright![2])) || 1;
    const { fg, bg } = colours(el);
    return ratio(fg.map((x) => Math.min(255, x * k)), bg.map((x) => Math.min(255, x * k)));
  };
}

let host: HTMLDivElement;
let probes: Probe[] = [];

beforeAll(() => {
  // Read the settled colours: a transition (Badge has transition-colors) would
  // still show the previous hue or theme right after a change.
  const still = document.createElement("style");
  still.textContent = "*, *::before, *::after { transition: none !important; }";
  document.head.appendChild(still);
  host = document.createElement("div");
  document.body.appendChild(host);
  // Surfaces: the page, a panel, and a tab row (at rest and hovered) on a plain
  // card and on every group colour's card (resting tint, and the drop-target tint).
  // Card fills as TabGroup draws them (plain, Unsorted, coloured).
  const cards: { name: string; className?: string; style?: CSSProperties }[] = [
    { name: "plain", className: "bg-ink/[0.015]" },
    { name: "unsorted", className: "bg-ink/[0.04]" },
    ...GROUP_COLORS.flatMap(({ id }: { id: GroupColor }) => [
      { name: id, style: { backgroundColor: groupTintSurface(id) } },
      { name: `${id} drop`, style: { backgroundColor: groupTintSurface(id, { strength: 2 }) } },
    ]),
  ];
  const marks = (where: string) => (
    <>
      {VARIANTS.map((v) => <Badge key={v} data-probe={`badge ${v} @ ${where}`} variant={v as never} size="sm">Badge</Badge>)}
      {TONES.map((t) => (
        <div key={`r${t}`} className="relative group h-10 w-48">
          <DuplicateRibbon copies={2} tone={t} corner="right" label="dupe" />
        </div>
      ))}
      {TONES.map((t) => (
        <span key={`i${t}`} className="relative inline-block h-5 w-5"><DuplicateIcon tone={t} /></span>
      ))}
    </>
  );
  const root = createRoot(host);
  flushSync(() => root.render(
    <TooltipProvider>
    <div className="bg-black-900 p-2">
      <div data-surface="page">{marks("page")}</div>
      <div className="bg-black-800" data-surface="panel">{marks("panel")}</div>
      {cards.map((c) => (
        <div key={c.name} className={c.className} style={c.style}>
          {(["bg-row", "bg-row-hover"] as const).map((row) => (
            <div key={row} className={`relative group ${row}`} data-row={`${c.name} ${row === "bg-row" ? "row" : "row hovered"}`}>
              {marks(`${c.name} ${row === "bg-row" ? "row" : "row hovered"}`)}
            </div>
          ))}
        </div>
      ))}
    </div>
    </TooltipProvider>,
  ));
});

afterAll(() => host.remove());

function collect(): Probe[] {
  const out: Probe[] = [];
  for (const el of host.querySelectorAll<HTMLElement>("[data-probe]")) {
    const variant = el.dataset.probe!.split(" ")[1];
    out.push({ name: el.dataset.probe!, el, hover: badgeHover(variant) });
  }
  for (const el of host.querySelectorAll<HTMLElement>('[data-duplicate-mark]')) {
    const where = el.closest<HTMLElement>("[data-row]")?.dataset.row ?? el.closest<HTMLElement>("[data-surface]")!.dataset.surface!;
    const tone = TONES.find((t) => el.className.includes(DUPLICATE_TONE[t][el.textContent ? "ribbon" : "icon"].split(" ").pop()!))!;
    out.push({ name: `${el.textContent ? "ribbon" : "icon"} ${tone} @ ${where}`, el });
  }
  return out;
}

describe("contrast guard (TASK-68)", () => {
  it("measures every Badge variant in badge.tsx and every duplicate mark tone", () => {
    expect(VARIANTS).toEqual(["default", "secondary", "outline", "accent", "success", "warning"]);
    probes = collect();
    // 6 variants + 3 ribbons + 3 icons on 2 surfaces + 2 row states x (plain + Unsorted + 9 colours x 2 tints) cards.
    expect(probes.length).toBe((VARIANTS.length + TONES.length * 2) * (2 + 2 * (2 + GROUP_COLORS.length * 2)));
  });

  for (const theme of ["light", "dark"] as const) {
    it(`keeps every mark >= ${MIN}:1 in ${theme}, at every hue x intensity x group tint`, () => {
      expect(probes.length, "nothing to measure").toBeGreaterThan(0);
      const root = document.documentElement;
      root.classList.toggle("light", theme === "light");
      root.classList.toggle("dark", theme === "dark");
      const worst = new Map<string, { v: number; at: string }>();
      for (const tint of GROUP_TINTS) for (const h of HUES) for (const i of INTENSITIES) {
        root.style.setProperty("--group-tint", String(tint));
        root.style.setProperty("--hue", String(h));
        root.style.setProperty("--intensity", String(i));
        for (const p of probes) {
          const { fg, bg } = colours(p.el);
          let v = ratio(fg, bg), at = `hue ${h} intensity ${i} tint ${tint}`;
          const hv = p.hover?.(p.el);
          if (hv !== undefined && hv < v) { v = hv; at += " (badge hover)"; }
          const w = worst.get(p.name);
          if (!w || v < w.v) worst.set(p.name, { v, at });
        }
      }
      const below = [...worst].filter(([, w]) => w.v < MIN).map(([n, w]) => `${n}: ${w.v.toFixed(2)} at ${w.at}`);
      expect(below, `below ${MIN}:1 in ${theme}`).toEqual([]);
    });
  }
});
