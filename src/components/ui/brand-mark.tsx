/**
 * The FlexTab mark: an accent tile holding the manifest icon used as a mask over an accent gradient,
 * so it follows the accent in every theme. Every place that draws the mark uses this (TASK-102):
 * the space rail and the sign-in dialog.
 *
 * Forced colours (Windows contrast themes) drop author backgrounds, gradients included, which left an
 * empty frame. There the same mask is painted in CanvasText instead, so the mark keeps its shape in a
 * system colour.
 */
export function BrandMark({ label }: { label?: string }) {
  const icon = typeof chrome !== "undefined" && chrome.runtime?.getManifest ? chrome.runtime.getManifest().icons?.["128"] : undefined
  const src = icon && chrome.runtime?.getURL ? chrome.runtime.getURL(icon) : undefined
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true }
  return (
    <div
      className="w-10 h-10 rounded-2xl border flex items-center justify-center"
      style={{
        backgroundColor: "var(--accent-subtle)",
        borderColor: "color-mix(in srgb, var(--accent) 34%, transparent)",
        boxShadow: "0 10px 24px -18px var(--accent), inset 0 1px 0 rgba(255,255,255,0.08)",
      }}
    >
      {src ? (
        <span {...a11y}
          className="h-7 w-7 forced-colors:![background:CanvasText] forced-colors:[forced-color-adjust:none]"
          style={{
            background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 70%, #ffffff), var(--accent))",
            WebkitMask: `url(${src}) center / contain no-repeat`,
            mask: `url(${src}) center / contain no-repeat`,
          }} />
      ) : (
        <span {...a11y} className="text-sm font-semibold" style={{ color: "var(--accent)" }}>F</span>
      )}
    </div>
  )
}
