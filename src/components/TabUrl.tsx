import { useLayoutEffect, useRef, useState } from "react"
import { fitLink, fitTail, splitDisplayUrl, type LinkCutScope } from "~src/lib/displayUrl"

const BASE = "text-fg-subtle text-[10px] font-sans"

/**
 * A saved tab's address line (TASK-54). The host stays first; when the line
 * is too long the rest is cut from its START, so its end (episode, slug, id),
 * the part that tells same-site tabs apart, stays visible:
 * "v18.site.test…season-2/episode/1".
 *
 * The cut is measured on the page's own text (Range rects over a hidden copy
 * of "…" + rest, in the line's font and features; canvas metrics drift from
 * them), re-measured when the line resizes, so the ellipsis sits tight
 * against the host. Without ResizeObserver it falls back to an end ellipsis.
 * `data-cut` tells the card's tooltip that the address was shortened.
 *
 * `pathShare` and `scope` (TASK-71, a saved tab's Link cut setting) choose
 * where the "…" sits (0 keeps the end, 1 the start) and which part gives way:
 * the whole link, only the site, or only the path (see fitLink). Without them
 * the rest keeps its end behind a whole site, as before (Opened Tabs).
 */
export function TabUrl({ url, pathShare, scope = "all" }: { url?: string; pathShare?: number; scope?: LinkCutScope }) {
  const parts = splitDisplayUrl(url)
  const rowRef = useRef<HTMLSpanElement>(null)
  const hostRef = useRef<HTMLSpanElement>(null)
  const probeRef = useRef<HTMLSpanElement>(null)
  const [fit, setFit] = useState<{ text: string; cut: boolean } | null>(null)
  const [link, setLink] = useState<{ host: string; rest: string; cut: boolean } | null>(null)
  const rest = parts?.rest ?? ""
  const host = parts?.host ?? ""
  const scoped = pathShare !== undefined

  useLayoutEffect(() => {
    const row = rowRef.current, hostEl = hostRef.current, text = probeRef.current?.firstChild
    if (!row || !hostEl || !text || !rest || typeof ResizeObserver === "undefined") return
    const range = document.createRange()
    const span = (from: number, to: number) => { range.setStart(text, from); range.setEnd(text, to); return range.getBoundingClientRect().width }
    const update = () => {
      // Fractional widths; fitTail owns the rounding allowances (a hair over
      // still counts as fitting, a cut text keeps half a pixel in hand).
      const ellipsis = span(0, 1)
      if (scoped) {
        // The probe holds "…" + host + rest: the whole line is measured and cut.
        const lineWidth = row.getBoundingClientRect().width
        setLink(lineWidth > 0 ? fitLink(host, rest, lineWidth, (f, t) => span(1 + f, 1 + t), ellipsis, pathShare, scope) : null)
        return
      }
      const width = row.getBoundingClientRect().width - hostEl.getBoundingClientRect().width
      setFit(width > 0 ? fitTail(rest, width, (i) => span(1 + i, 1 + rest.length), ellipsis) : null)
    }
    update()
    // The row resizes with the card; the probe and host resize when the web
    // font arrives (text metrics change while the row may keep its width).
    const ro = new ResizeObserver(update)
    ro.observe(row)
    ro.observe(probeRef.current!)
    ro.observe(hostEl)
    return () => ro.disconnect()
  }, [rest, host, scoped, pathShare, scope])

  if (!parts || !rest) {
    return <span data-clip className={`${BASE} truncate`}>{url?.replace(/^https?:\/\//, "")}</span>
  }
  // The invisible sizer keeps the full address as this line's intrinsic width,
  // as the old single span did, so a shrink-to-fit card column still widens
  // for the address and not only for the title; the visible line sits on top.
  return (
    <span className={`relative block min-w-0 overflow-hidden ${BASE}`}>
      <span aria-hidden className="invisible block truncate">{parts.host}{rest}</span>
      <span ref={probeRef} aria-hidden className="invisible absolute left-0 top-0 whitespace-nowrap">{"…" + (scoped ? host : "") + rest}</span>
      <span ref={rowRef} className="absolute inset-0 flex whitespace-nowrap">
        {scoped ? (
          <>
            <span ref={hostRef} data-clip className="shrink-0">{link ? link.host : host}</span>
            <span data-clip data-cut={link?.cut ? "true" : undefined} className="min-w-0 truncate">{link ? link.rest : rest}</span>
          </>
        ) : (
          <>
            <span ref={hostRef} data-clip className="max-w-[60%] shrink-0 truncate">{parts.host}</span>
            <span data-clip data-cut={fit?.cut ? "true" : undefined} className="min-w-0 truncate">{fit ? fit.text : rest}</span>
          </>
        )}
      </span>
    </span>
  )
}
