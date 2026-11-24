import { DEFAULT_APPEARANCE, type Appearance } from "~src/lib/theme"

/**
 * The app icon in the user's accent (TASK-107): the new tab's tab icon and the toolbar button. The
 * manifest icon is FlexTab blue with a darker fold; recolouring shifts every pixel's hue by the
 * accent's distance from that blue and scales its saturation by the intensity, keeping lightness and
 * alpha, so the fold's shading stays and the default accent gives back the icon unchanged.
 * chrome://extensions, the Web Store and the install prompt always show the manifest icon.
 */
export type AppIconLook = Pick<Appearance, "hue" | "intensity" | "appIcon">

/** chrome.storage.local copy of the look for the background worker, which has no localStorage. */
export const APP_ICON_STORAGE_KEY = "flextab-app-icon"

/** Whether the icon is drawn, or the manifest file is used as it is. */
export function isTinted(look: AppIconLook): boolean {
  return look.appIcon === "accent" && (look.hue !== DEFAULT_APPEARANCE.hue || look.intensity !== DEFAULT_APPEARANCE.intensity)
}

export function readAppIconLook(value: unknown): AppIconLook {
  const v = (value ?? {}) as Partial<AppIconLook>
  const num = (n: unknown, min: number, max: number, fallback: number) => (typeof n === "number" && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback)
  return {
    hue: num(v.hue, 0, 360, DEFAULT_APPEARANCE.hue),
    intensity: num(v.intensity, 0, 100, DEFAULT_APPEARANCE.intensity),
    appIcon: v.appIcon === "blue" ? "blue" : "accent",
  }
}

/** Recolours RGBA pixels in place (see the module note). */
export function tintPixels(data: Uint8ClampedArray, hue: number, intensity: number): void {
  const shift = hue - DEFAULT_APPEARANCE.hue
  const satScale = intensity / 100
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2
    let h = 0, s = 0
    if (max !== min) {
      const d = max - min
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
      h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
      h *= 60
    }
    h = (((h + shift) % 360) + 360) % 360
    s *= satScale
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2
    const [r1, g1, b1] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
    data[i] = Math.round((r1 + m) * 255)
    data[i + 1] = Math.round((g1 + m) * 255)
    data[i + 2] = Math.round((b1 + m) * 255)
  }
}

/** The icon at `size` px in the accent. */
export function drawTintedIcon(base: CanvasImageSource, size: number, look: AppIconLook): ImageData {
  const ctx = new OffscreenCanvas(size, size).getContext("2d", { willReadFrequently: true })!
  ctx.drawImage(base, 0, 0, size, size)
  const image = ctx.getImageData(0, 0, size, size)
  tintPixels(image.data, look.hue, look.intensity)
  return image
}

/** The manifest icon file closest to `size` px, as a bitmap. */
export async function loadManifestIcon(size: number): Promise<ImageBitmap> {
  const icons = (chrome.runtime.getManifest().icons ?? {}) as Record<string, string>
  const sizes = Object.keys(icons).map(Number).sort((a, b) => a - b)
  const pick = sizes.find((s) => s >= size) ?? sizes[sizes.length - 1]
  const res = await fetch(chrome.runtime.getURL(icons[String(pick)]))
  return createImageBitmap(await res.blob())
}

/**
 * localStorage copy of the last drawn tab icon, as a data URL keyed by the look it was drawn for:
 * boot/look.js puts it on the page's icon link in <head>, so a new tab or a reload shows the accent
 * icon from the start instead of the blue file first.
 */
export const FAVICON_STORAGE_KEY = "flextab-favicon"

export const faviconKey = (look: AppIconLook) => `${look.hue},${look.intensity}`

let faviconCall = 0

function cachedFavicon(look: AppIconLook): string | null {
  try {
    const c = JSON.parse(localStorage.getItem(FAVICON_STORAGE_KEY) ?? "null") as { key?: string; url?: string } | null
    return c && c.key === faviconKey(look) && typeof c.url === "string" && c.url.startsWith("data:image/png") ? c.url : null
  } catch { return null }
}

/**
 * The new tab's tab icon in the accent; the manifest blue (the page's own favicon) otherwise. Safe
 * to call on every look change: the last call wins. A look drawn before comes from the copy.
 */
export async function applyAppIconFavicon(look: AppIconLook, doc: Document = document): Promise<void> {
  const call = ++faviconCall
  const link = doc.querySelector<HTMLLinkElement>('link[rel~="icon"]')
  if (!link) return
  if (!link.dataset.defaultHref) link.dataset.defaultHref = link.getAttribute("href") ?? ""
  if (!isTinted(look)) {
    if (link.getAttribute("href") !== link.dataset.defaultHref) link.href = link.dataset.defaultHref
    return
  }
  const cached = cachedFavicon(look)
  if (cached) {
    if (link.getAttribute("href") !== cached) link.href = cached
    return
  }
  const bitmap = await loadManifestIcon(64)
  if (call !== faviconCall) { bitmap.close(); return }
  try {
    const image = drawTintedIcon(bitmap, 64, look)
    const canvas = new OffscreenCanvas(64, 64)
    canvas.getContext("2d")!.putImageData(image, 0, 0)
    const blob = await canvas.convertToBlob({ type: "image/png" })
    const url = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
    if (call !== faviconCall) return
    try { localStorage.setItem(FAVICON_STORAGE_KEY, JSON.stringify({ key: faviconKey(look), url })) } catch { /* drawn again next time */ }
    link.href = url
  } finally {
    bitmap.close()
  }
}
