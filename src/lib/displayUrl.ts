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
 * `text` cut in the MIDDLE to fit `width` (TASK-54, the user's call for
 * titles): as many characters as fit, split evenly between its start and its
 * end around a "…". Cuts never split a surrogate pair, and spaces at the cut
 * are dropped so the ellipsis sits against a word. `rangeWidth(from, to)` is
 * the rendered width of `text.slice(from, to)`; `ellipsisWidth` that of "…".
 */
export function fitMiddle(text: string, width: number, rangeWidth: (from: number, to: number) => number, ellipsisWidth: number): { text: string; cut: boolean } {
  const len = text.length
  if (rangeWidth(0, len) <= width + FITS_EPSILON) return { text, cut: false }
  const cutAt = (n: number) => {
    let a = Math.ceil(n / 2), b = len - (n - Math.ceil(n / 2))
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
