/**
 * Splits a web URL for display as host + the rest (TASK-54), so the rest can
 * be cut from its start and its end (episode, slug, id) stays visible.
 * Host and rest together are exactly what the card showed before
 * (the URL without its http(s):// scheme). A local file splits as "file://"
 * + its path, so its file name stays visible too. Other schemes return null.
 */
export function splitDisplayUrl(url?: string): { host: string; rest: string } | null {
  const m = url?.match(/^https?:\/\/([^/?#]+)(.*)$/i)
  if (m) return { host: m[1], rest: m[2] }
  const file = url?.match(/^file:\/\/(\/.*)$/i)
  return file ? { host: "file://", rest: file[1] } : null
}

/**
 * Layout snaps box widths to 1/64px while Range rects report exact glyph
 * widths, so a text that fits to the pixel can read a hair wider than its box:
 * FITS_EPSILON keeps such a text whole. A cut text is laid out from pieces
 * measured apart (start, "…", end), which can join a little wider: it keeps
 * CUT_MARGIN in hand so it never overflows into a second, CSS ellipsis.
 */
const FITS_EPSILON = 0.02
const CUT_MARGIN = 0.5

/**
 * The longest end of `rest` that fits in `width` after an ellipsis, so a cut
 * address reads "host…season-2/episode/1" with the ellipsis tight against
 * the host (a CSS rtl ellipsis leaves a gap of up to one glyph). Returns
 * `rest` unchanged when it fits. `suffixWidth(i)` is the rendered width of
 * `rest.slice(i)`; `ellipsisWidth` the width of "…" in the same font.
 */
export function fitTail(rest: string, width: number, suffixWidth: (start: number) => number, ellipsisWidth: number): { text: string; cut: boolean } {
  if (suffixWidth(0) <= width + FITS_EPSILON) return { text: rest, cut: false }
  let lo = 0, hi = rest.length // number of trailing characters kept
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (ellipsisWidth + suffixWidth(rest.length - mid) <= width - CUT_MARGIN) lo = mid
    else hi = mid - 1
  }
  return { text: "…" + rest.slice(rest.length - lo), cut: true }
}

const isHigh = (c: number) => c >= 0xd800 && c <= 0xdbff
const isLow = (c: number) => c >= 0xdc00 && c <= 0xdfff

/**
 * `text` cut to fit `width` (TASK-54, the user's call for titles): as many
 * characters as fit around a "…". `startShare` is where the "…" sits (TASK-71):
 * the share of the kept characters taken from the start, 0.5 = the middle
 * (start and end kept evenly), 0 = only the end kept, 1 = only the start kept.
 * Cuts never split a surrogate pair, and spaces at the cut are dropped so the
 * ellipsis sits against a word. `rangeWidth(from, to)` is the rendered width of
 * `text.slice(from, to)`; `ellipsisWidth` that of "…".
 */
export function fitMiddle(text: string, width: number, rangeWidth: (from: number, to: number) => number, ellipsisWidth: number, startShare = 0.5): { text: string; cut: boolean } {
  const len = text.length
  if (rangeWidth(0, len) <= width + FITS_EPSILON) return { text, cut: false }
  const cutAt = (n: number) => {
    const head = Math.ceil(n * Math.min(1, Math.max(0, startShare)))
    let a = head, b = len - (n - head)
    if (a > 0 && isHigh(text.charCodeAt(a - 1))) a--
    if (b < len && isLow(text.charCodeAt(b))) b++
    return { a, b }
  }
  const fits = (n: number) => { const { a, b } = cutAt(n); return rangeWidth(0, a) + ellipsisWidth + rangeWidth(b, len) <= width - CUT_MARGIN }
  let lo = 0, hi = len - 1 // characters kept
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (fits(mid)) lo = mid
    else hi = mid - 1
  }
  const { a, b } = cutAt(lo)
  return { text: text.slice(0, a).trimEnd() + "…" + text.slice(b).trimStart(), cut: true }
}

/** True when any `[data-clip]` text inside `el` is cut, by a CSS ellipsis or by `fitTail` (`data-cut`). */
export function hasClippedText(el: Element | null): boolean {
  if (!el) return false
  return [...el.querySelectorAll<HTMLElement>("[data-clip]")].some((n) => n.dataset.cut === "true" || n.scrollWidth > n.clientWidth + 1)
}

/** Which part of a link gives way first when it is cut (TASK-71, Settings › Appearance › Link cut). */
export type LinkCutScope = "all" | "site" | "path"

/** The most of the line a site keeps while only the path is cut (TASK-54), so the path always has room. */
export const SITE_MAX_SHARE = 0.6

/**
 * A link (`host` + `rest`) cut to fit `width` (TASK-71). `share` is where the
 * "…" sits (0 keeps the end, 1 the start). `scope` is the part cut:
 * - "path": the site stays whole and only the path is cut, while the site
 *   takes no more than SITE_MAX_SHARE of the line;
 * - "site": the path stays whole and only the site is cut, while the path fits;
 * - "all": the whole link is cut as one.
 * When the chosen part alone cannot make it fit, the whole link is cut as one,
 * so a line never shows two "…". `rangeWidth(from, to)` measures
 * `(host + rest).slice(from, to)`. The result's host + rest is what shows.
 */
export function fitLink(host: string, rest: string, width: number, rangeWidth: (from: number, to: number) => number, ellipsisWidth: number, share: number, scope: LinkCutScope): { host: string; rest: string; cut: boolean } {
  const full = host + rest, h = host.length
  if (rangeWidth(0, full.length) <= width + FITS_EPSILON) return { host, rest, cut: false }
  const hostWidth = rangeWidth(0, h), restWidth = rangeWidth(h, full.length)
  if (scope === "path" && hostWidth <= width * SITE_MAX_SHARE) {
    const r = fitMiddle(rest, width - hostWidth, (f, t) => rangeWidth(h + f, h + t), ellipsisWidth, share)
    return { host, rest: r.text, cut: true }
  }
  if (scope === "site" && restWidth + ellipsisWidth <= width - CUT_MARGIN) {
    const r = fitMiddle(host, width - restWidth, rangeWidth, ellipsisWidth, share)
    return { host: r.text, rest, cut: true }
  }
  return { host: "", rest: fitMiddle(full, width, rangeWidth, ellipsisWidth, share).text, cut: true }
}
