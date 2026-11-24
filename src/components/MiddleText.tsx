import { useLayoutEffect, useRef, useState } from "react"
import { fitMiddle } from "~src/lib/displayUrl"

/**
 * One line of text that, when too long, is cut in the middle: its start and
 * its end stay, "…" replaces the middle (saved tab titles).
 * `startShare` moves the "…": 0 keeps the end, 1 keeps the start.
 *
 * Same measuring as TabUrl: Range rects over a hidden copy in the line's own
 * font, exact fractional widths, re-measured when the line or the text's
 * metrics change (ResizeObserver on the line and on the probe). An invisible
 * sizer keeps the full text as the line's intrinsic width, so a shrink-to-fit
 * column sizes exactly as it did with a plain truncated span. Without
 * ResizeObserver it falls back to an end ellipsis. `data-cut` marks a cut.
 */
export function MiddleText({ text, className = "", startShare = 0.5 }: { text: string; className?: string; startShare?: number }) {
  const lineRef = useRef<HTMLSpanElement>(null)
  const probeRef = useRef<HTMLSpanElement>(null)
  const [fit, setFit] = useState<{ text: string; cut: boolean } | null>(null)

  useLayoutEffect(() => {
    const line = lineRef.current, probe = probeRef.current, node = probe?.firstChild
    if (!line || !probe || !node || !text || typeof ResizeObserver === "undefined") return
    const range = document.createRange()
    // The probe holds "…" + text, so text index i is probe index i + 1.
    const width = (from: number, to: number) => { range.setStart(node, from); range.setEnd(node, to); return range.getBoundingClientRect().width }
    const update = () => {
      const w = line.getBoundingClientRect().width
      setFit(w > 0 ? fitMiddle(text, w, (f, t) => width(f + 1, t + 1), width(0, 1), startShare) : null)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(line)
    ro.observe(probe)
    return () => ro.disconnect()
  }, [text, startShare])

  return (
    <span className={`relative block min-w-0 overflow-hidden ${className}`}>
      <span aria-hidden className="invisible block truncate">{text}</span>
      <span ref={probeRef} aria-hidden className="invisible absolute left-0 top-0 whitespace-nowrap">{"…" + text}</span>
      <span ref={lineRef} data-clip data-cut={fit?.cut ? "true" : undefined} className="absolute inset-0 truncate">{fit ? fit.text : text}</span>
    </span>
  )
}
