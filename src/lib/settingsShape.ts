import type { SettingsTab } from "~src/components/settings/types";
import type { Density } from "~src/store/useSettingsStore";
import { DEFAULT_APPEARANCE } from "~src/lib/theme";

const DENSITIES: Density[] = ["compact", "cozy", "comfortable"];

/** The density on <html> (lib/theme, boot/look.js), which the loading shell is drawn in. */
export function currentDensity(): Density {
  const found = DENSITIES.find((d) => document.documentElement.classList.contains(`density-${d}`));
  return found ?? DEFAULT_APPEARANCE.density;
}

/**
 * The shape of each Settings page as it was last seen, so the loading shell draws the
 * page that is coming instead of the workspace. Like lib/shellShape: sizes and counts only, never a
 * label or a value.
 *
 * A page is a stack of section cards (SettingsSection). Each card is its header box, an optional
 * notice, then its rows. A tile row (SettingRow in a card) keeps its content height here; its
 * padding and the gaps come from the density variables when the skeleton is drawn, so a density
 * change does not stale the shape. Any other row (a list) keeps its whole height.
 */
export type SettingsRowShape =
  | { tile: true; content: number; control: [number, number] }
  | { tile: false; height: number };

export type SettingsCardShape = {
  /** Space above the card: 40px between cards, more before the first card when something sits there (Spaces' tab strip). */
  gapBefore: number;
  /** A notice between the header and the rows. */
  notice: number | null;
  rows: SettingsRowShape[];
};

export type SettingsPageShape = {
  /** The controls column's width it was seen at: rows wrap and stack with it, so a shape belongs to one width. */
  width: number;
  /** The density it was seen at: list rows and wrapping change with the density's padding. */
  density: Density;
  cards: SettingsCardShape[];
  /** Theme, Display and Layout show the previewer beside the controls from 1440px: its height. */
  preview: number | null;
};

export type SettingsShape = {
  /** Which nav the user had: a guest's has no Account group. */
  signedIn: boolean;
  /** Per topic, the widths and densities it was last seen at, most recent first. */
  pages: Partial<Record<SettingsTab, SettingsPageShape[]>>;
};

export const SETTINGS_SHAPE_STORAGE_KEY = "flextab-settings-shape";

/** Bounds that keep the copy small; the skeleton stops at the screen's height anyway. */
/** `seen`: widths x densities kept per topic; every window from about 1024px up is one width (640). */
const CAP = { cards: 12, rows: 20, px: 4000, seen: 12 };

/**
 * The controls column's width in a window this wide, as SettingsContent lays it out: the rail
 * (64), the Settings nav from md (256), main's two borders, the scroll area's padding (32, 48
 * from sm, 64 from md), and the column's 40rem cap. Wide windows all give 640, so resizing one
 * does not need a new shape.
 */
export function settingsColumnWidth(windowWidth: number): number {
  const nav = windowWidth >= 768 ? 256 : 0;
  const padding = windowWidth >= 768 ? 64 : windowWidth >= 640 ? 48 : 32;
  return Math.max(0, Math.min(640, windowWidth - 64 - nav - 2 - padding));
}

const tile = (content = 42, control: [number, number] = [256, 32]): SettingsRowShape => ({ tile: true, content, control });
const card = (rows: SettingsRowShape[], gapBefore = 40): SettingsCardShape => ({ gapBefore, notice: null, rows });
const tiles = (n: number) => Array.from({ length: n }, () => tile());

/**
 * A page never opened on this device: its sections and rows as they are drawn signed in, at the
 * default density (measured in a production build, 2026-11-23). The first card sits at the top.
 */
export const SAMPLE_PAGES: Record<SettingsTab, Omit<SettingsPageShape, "width" | "density">> = {
  spaces: { cards: [card(tiles(3), 77), card(tiles(1))], preview: null },
  saving: { cards: [card(tiles(4), 0), card(tiles(1)), card(tiles(1))], preview: null },
  backup: { cards: [card(tiles(2), 0), card(tiles(2)), card([{ tile: false, height: 158 }])], preview: null },
  theme: { cards: [card([tile(), tile(50), tile(), tile(), tile(), tile()], 0), card(tiles(1))], preview: 535 },
  display: { cards: [card(tiles(3), 0), card(tiles(4)), card(tiles(1)), card(tiles(1))], preview: 535 },
  layout: { cards: [card(tiles(2), 0), card(tiles(4)), card(tiles(1))], preview: 535 },
  profile: { cards: [card([{ tile: false, height: 70 }], 0), card(tiles(1)), card(tiles(1))], preview: null },
  security: { cards: [card(tiles(2), 0), card(tiles(1))], preview: null },
  plan: { cards: [card([{ tile: false, height: 160 }], 0), card([{ tile: false, height: 158 }])], preview: null },
};

/** Tenths of a pixel: a row is often 69.5px tall (an xs line is 19.5px), and whole pixels would add up down the page. */
const round = (n: number) => Math.max(0, Math.min(Math.round(n * 10) / 10, CAP.px));
const px = (v: string) => parseFloat(v) || 0;

/**
 * Reads the shape of the Settings page on screen: `column` is the controls column (the cards'
 * container), `preview` the previewer when one is shown. Card and row parts are found by the
 * markup SettingsSection and SettingRow give them.
 */
export function measureSettingsPage(column: HTMLElement, preview: HTMLElement | null, density: Density): SettingsPageShape {
  const cards = Array.from(column.querySelectorAll<HTMLElement>('section[data-look="card"]')).slice(0, CAP.cards);
  let above = column.getBoundingClientRect().top;
  return {
    width: round(column.getBoundingClientRect().width),
    density,
    cards: cards.map((el) => {
      const box = el.getBoundingClientRect();
      const gapBefore = round(box.top - above);
      above = box.bottom;
      const parts = Array.from(el.children) as HTMLElement[];
      const notice = parts.length > 2 ? round(parts[1].getBoundingClientRect().height) : null;
      const rowsHost = parts[parts.length - 1];
      const rows = (Array.from(rowsHost?.children ?? []) as HTMLElement[]).slice(0, CAP.rows).map((row): SettingsRowShape => {
        const h = row.getBoundingClientRect().height;
        if (!row.classList.contains("bg-row")) return { tile: false, height: round(h) };
        const s = getComputedStyle(row);
        const control = row.lastElementChild?.getBoundingClientRect();
        const first = (row.lastElementChild?.firstElementChild as HTMLElement | null)?.getBoundingClientRect();
        return { tile: true, content: round(h - px(s.paddingTop) - px(s.paddingBottom)), control: [round(first?.width ?? control?.width ?? 0), round(first?.height ?? control?.height ?? 0)] };
      });
      return { gapBefore, notice, rows };
    }),
    preview: preview && preview.getBoundingClientRect().height > 0 ? round(preview.getBoundingClientRect().height) : null,
  };
}

const isPx = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= CAP.px;

function validPage(p: unknown): p is SettingsPageShape {
  const s = p as SettingsPageShape;
  if (!s || !isPx(s.width) || !DENSITIES.includes(s.density) || !Array.isArray(s.cards) || !(s.preview === null || isPx(s.preview))) return false;
  return s.cards.every((c) => c && isPx(c.gapBefore) && (c.notice === null || isPx(c.notice)) && Array.isArray(c.rows)
    && c.rows.every((r) => r && (r.tile === true
      ? isPx(r.content) && Array.isArray(r.control) && r.control.length === 2 && r.control.every(isPx)
      : r.tile === false && isPx(r.height))));
}

export function readStoredSettingsShape(): SettingsShape | null {
  try {
    const raw = localStorage.getItem(SETTINGS_SHAPE_STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SettingsShape;
    if (!s || typeof s.signedIn !== "boolean" || !s.pages || typeof s.pages !== "object") return null;
    const pages: SettingsShape["pages"] = {};
    for (const [tab, seen] of Object.entries(s.pages)) {
      const valid = Array.isArray(seen) ? seen.filter(validPage).slice(0, CAP.seen) : [];
      if (valid.length) pages[tab as SettingsTab] = valid;
    }
    return { signedIn: s.signedIn, pages };
  } catch {
    return null;
  }
}

/** Keeps one page's shape at its width and density (replacing that pair's last one) and which nav the user has. */
export function storeSettingsShape(tab: SettingsTab, page: SettingsPageShape, signedIn: boolean) {
  try {
    const base = readStoredSettingsShape();
    const seen = [page, ...(base?.pages[tab] ?? []).filter((p) => p.width !== page.width || p.density !== page.density)].slice(0, CAP.seen);
    localStorage.setItem(SETTINGS_SHAPE_STORAGE_KEY, JSON.stringify({ signedIn, pages: { ...base?.pages, [tab]: seen } }));
  } catch {
    // Storage blocked: the loading shell draws the topic's sample.
  }
}

/**
 * The page to draw for a topic at a column width and density: its shape there, else the closest one
 * seen (the same density first, then the nearest width), else the topic's sample.
 */
export function settingsPageShape(shape: SettingsShape | null, tab: SettingsTab, width: number, density: Density): SettingsPageShape {
  const seen = shape?.pages[tab] ?? [];
  const cost = (p: SettingsPageShape) => (p.density === density ? 0 : 100000) + Math.abs(p.width - width);
  const nearest = [...seen].sort((a, b) => cost(a) - cost(b))[0];
  return nearest ?? { width, density, ...SAMPLE_PAGES[tab] };
}
