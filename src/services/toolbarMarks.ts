// The marks on the toolbar icon: every state the FlexTab button shows
// is drawn into the icon itself, never as a browser badge, whose box, padding
// and font the browser fixes (too big, and out of proportion with the icon).
//
// A mark is a disc half the icon wide in its bottom-right corner (8 px on the
// 16 px icon), cut out of the logo by a thin clear ring, with a glyph built
// from whole-pixel squares so it stays crisp and centred: 2 px strokes on the
// 32 px icon (2x screens), 1 px on the 16 px one where the disc is too small
// for more (the "!" keeps 2 px, a 1 px bar cannot sit centred in it).
//
// The service worker has no DOM, so marks are drawn with OffscreenCanvas from
// the manifest's own icon files and handed to chrome.action.setIcon as pixels.

import { drawTintedIcon, isTinted, type AppIconLook } from "~src/lib/appIcon"

export type ToolbarMark = "saved" | "failed" | "unsavable"

/** Disc and glyph colours; each pair reads at 4.5:1 or more. */
export const MARKS: Record<ToolbarMark, { fill: string; ink: string }> = {
  /** The popup's and Opened Tabs' saved check: dark on the success green (about 11:1). */
  saved: { fill: "#4ade80", ink: "#0b0d10" },
  /** A capture that could not be written: white "!" on red (about 4.8:1). */
  failed: { fill: "#dc2626", ink: "#ffffff" },
  /** A page that cannot be saved, such as chrome://: white "×" on grey (about 4.8:1). */
  unsavable: { fill: "#6b7280", ink: "#ffffff" },
}

/** The icon sizes the toolbar draws: 16 px, and 32 px on a 2x screen. */
export const ICON_SIZES = [16, 32] as const

type Glyph = { squares: [number, number][]; stroke: number; width: number; height: number }

/** Each glyph as stroke-sized squares stepping one pixel at a time, so diagonals run at exactly 45°. */
const GLYPHS: Record<ToolbarMark, (large: boolean) => Glyph> = {
  // A check: a short arm down, then a long arm up.
  saved: (large) => {
    const [stroke, short, long] = large ? [2, 3, 5] : [1, 1, 3]
    const squares: [number, number][] = []
    for (let i = 0; i <= short; i++) squares.push([i, long - short + i])
    for (let j = 1; j <= long; j++) squares.push([short + j, long - j])
    return { squares, stroke, width: short + long + stroke, height: long + stroke }
  },
  // A bar, one clear pixel, a dot.
  failed: (large) => {
    const [stroke, bar] = large ? [2, 6] : [2, 2]
    const squares: [number, number][] = []
    for (let y = 0; y < bar; y++) squares.push([0, y])
    squares.push([0, bar + stroke])
    return { squares, stroke, width: stroke, height: bar + 2 * stroke }
  },
  // A cross: two 45° strokes.
  unsavable: (large) => {
    const [stroke, n] = large ? [2, 6] : [1, 3]
    const squares: [number, number][] = []
    for (let i = 0; i <= n; i++) squares.push([i, i], [i, n - i])
    return { squares, stroke, width: n + stroke, height: n + stroke }
  },
}

/** The FlexTab icon at `size` px with `mark` on it. */
export function drawMarkedIcon(base: CanvasImageSource, size: number, mark: ToolbarMark): ImageData {
  const ctx = new OffscreenCanvas(size, size).getContext("2d")!
  ctx.drawImage(base, 0, 0, size, size)
  const diameter = size / 2
  const r = diameter / 2
  const corner = size - diameter
  const disc = (radius: number) => { ctx.beginPath(); ctx.arc(size - r, size - r, radius, 0, Math.PI * 2); ctx.fill() }
  // A clear ring between the logo and the mark.
  ctx.globalCompositeOperation = "destination-out"
  disc(r + Math.max(1, size / 16))
  ctx.globalCompositeOperation = "source-over"
  ctx.fillStyle = MARKS[mark].fill
  disc(r)
  const glyph = GLYPHS[mark](size >= 32)
  const x0 = corner + Math.floor((diameter - glyph.width) / 2)
  const y0 = corner + Math.floor((diameter - glyph.height) / 2)
  ctx.fillStyle = MARKS[mark].ink
  for (const [x, y] of glyph.squares) ctx.fillRect(x0 + x, y0 + y, glyph.stroke, glyph.stroke)
  return ctx.getImageData(0, 0, size, size)
}

/**
 * The manifest's toolbar icon files, by size, from the extension root: a bare
 * name given to setIcon resolves against the worker script's own folder.
 */
export function defaultIconPaths(): Record<string, string> {
  const icons = chrome.runtime.getManifest().action?.default_icon as Record<string, string>
  return Object.fromEntries(Object.entries(icons).map(([size, file]) => [size, `/${file.replace(/^\//, "")}`]))
}

const drawn = new Map<string, Promise<Record<number, ImageData>>>()

/**
 * The icon at every toolbar size, in the accent when the look asks for it, with `mark`
 * on it or none (the resting icon). Drawn once per worker per mark and look, retried after a failure.
 */
export function markedIconImages(mark: ToolbarMark | null, look?: AppIconLook): Promise<Record<number, ImageData>> {
  const tinted = look && isTinted(look) ? look : null
  const key = `${mark ?? "rest"}|${tinted ? `${tinted.hue},${tinted.intensity}` : "blue"}`
  const cached = drawn.get(key)
  if (cached) return cached
  const drawing = (async () => {
    const paths = defaultIconPaths()
    return Object.fromEntries(await Promise.all(ICON_SIZES.map(async (size) => {
      // getURL gets the path without its leading slash: Chrome drops it, but Firefox keeps it and
      // nests the extension URL inside itself, so the fetch fails and the icon is never drawn.
      let bitmap = await createImageBitmap(await (await fetch(chrome.runtime.getURL(paths[size].replace(/^\//, "")))).blob())
      try {
        if (tinted) {
          const recoloured = await createImageBitmap(drawTintedIcon(bitmap, size, tinted))
          bitmap.close()
          bitmap = recoloured
        }
        if (!mark) {
          const ctx = new OffscreenCanvas(size, size).getContext("2d")!
          ctx.drawImage(bitmap, 0, 0, size, size)
          return [size, ctx.getImageData(0, 0, size, size)] as const
        }
        return [size, drawMarkedIcon(bitmap, size, mark)] as const
      } finally { bitmap.close() }
    })))
  })()
  drawn.set(key, drawing)
  drawing.catch(() => { if (drawn.get(key) === drawing) drawn.delete(key) })
  return drawing
}

/** Forget the drawn icons (tests). */
export function resetMarkedIcons(): void {
  drawn.clear()
}
