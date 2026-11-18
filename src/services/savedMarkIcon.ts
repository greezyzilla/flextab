// The saved mark on the toolbar icon (TASK-78): the popup's and Opened Tabs'
// green check, drawn into the FlexTab icon itself rather than shown as a badge,
// whose size the browser fixes (too big for a mark that only says "saved").
//
// The service worker has no DOM, so the mark is drawn with OffscreenCanvas from
// the manifest's own icon files and handed to chrome.action.setIcon as pixels.

/**
 * A dark check on the success green (about 11:1), half the icon wide (8 px on
 * the 16 px icon) in its bottom-right corner, cut out of the logo by a thin
 * clear ring so it reads on light and dark toolbars alike.
 */
export const SAVED_MARK = { fill: "#4ade80", check: "#0b0d10", ratio: 0.5 } as const

/** The icon sizes the toolbar draws: 16 px, and 32 px on a 2x screen. */
export const ICON_SIZES = [16, 32] as const

/** The FlexTab icon at `size` px with the saved mark on it. */
export function drawSavedIcon(base: CanvasImageSource, size: number): ImageData {
  const ctx = new OffscreenCanvas(size, size).getContext("2d")!
  ctx.drawImage(base, 0, 0, size, size)
  const r = (size * SAVED_MARK.ratio) / 2
  const cx = size - r
  const cy = size - r
  const disc = (radius: number) => { ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fill() }
  // A clear ring between the logo and the mark.
  ctx.globalCompositeOperation = "destination-out"
  disc(r + Math.max(1, size / 16))
  ctx.globalCompositeOperation = "source-over"
  ctx.fillStyle = SAVED_MARK.fill
  disc(r)
  ctx.strokeStyle = SAVED_MARK.check
  ctx.lineWidth = Math.max(1, r * 0.34)
  ctx.lineCap = "round"
  ctx.lineJoin = "round"
  ctx.beginPath()
  ctx.moveTo(cx - r * 0.45, cy + r * 0.02)
  ctx.lineTo(cx - r * 0.1, cy + r * 0.38)
  ctx.lineTo(cx + r * 0.5, cy - r * 0.35)
  ctx.stroke()
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

let savedIcon: Promise<Record<number, ImageData>> | null = null

/** The marked icon at every toolbar size; drawn once per worker, retried after a failure. */
export function savedIconImages(): Promise<Record<number, ImageData>> {
  if (savedIcon) return savedIcon
  const drawing = (async () => {
    const paths = defaultIconPaths()
    return Object.fromEntries(await Promise.all(ICON_SIZES.map(async (size) => {
      const bitmap = await createImageBitmap(await (await fetch(chrome.runtime.getURL(paths[size]))).blob())
      try { return [size, drawSavedIcon(bitmap, size)] as const } finally { bitmap.close() }
    })))
  })()
  savedIcon = drawing
  drawing.catch(() => { if (savedIcon === drawing) savedIcon = null })
  return drawing
}

/** Forget the drawn icon (tests). */
export function resetSavedIcon(): void {
  savedIcon = null
}
