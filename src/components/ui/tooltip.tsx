import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

import { cn } from "~src/lib/utils"

const TooltipProvider = TooltipPrimitive.Provider

const Tooltip = TooltipPrimitive.Root

const TooltipTrigger = TooltipPrimitive.Trigger

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, collisionPadding = 8, children, ...props }, ref) => {
  // Fit the box to its longest line. CSS alone can't: once a tip wraps, its box takes the full
  // max-width and leaves a gap after the longest line. The max-width still caps it; a one-line tip
  // is left as it is. Radix mounts the box through a portal after this component renders, so the
  // fit runs when the box is attached, and again whenever its size changes (new text).
  // The text is found inside the box: Radix also renders a hidden copy of it for screen readers.
  const observer = React.useRef<ResizeObserver | null>(null)
  const setRefs = React.useCallback((node: HTMLDivElement | null) => {
    observer.current?.disconnect()
    observer.current = null
    if (typeof ref === "function") ref(node)
    else if (ref) ref.current = node
    if (!node) return
    const fit = () => {
      const el = node.querySelector<HTMLElement>(":scope > [data-tip-text]")
      if (!el) return
      node.style.width = ""
      const range = document.createRange()
      if (typeof range.getClientRects !== "function") return // no layout engine (jsdom)
      range.selectNodeContents(el)
      const lines = Array.from(range.getClientRects())
      if (lines.length < 2) return
      // The open animation scales the box (zoom-in-95): measure in layout pixels, not on-screen ones.
      const scale = node.getBoundingClientRect().width / node.offsetWidth || 1
      const widest = (Math.max(...lines.map((r) => r.right)) - Math.min(...lines.map((r) => r.left))) / scale
      const cs = getComputedStyle(node)
      const chrome = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth)
      node.style.width = `${Math.ceil(widest + chrome)}px`
    }
    fit()
    if (typeof ResizeObserver !== "undefined") {
      observer.current = new ResizeObserver(fit)
      observer.current.observe(node)
    }
  }, [ref])
  return (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={setRefs}
      sideOffset={sideOffset}
      collisionPadding={collisionPadding}
      className={cn(
        // A long tip (a full path, a long name) wraps inside the surface, even the 320px popup,
        // without leaving one word alone on its last line (TASK-69).
        // No overflow-hidden: the zoom transform makes this box the arrow's containing block, so it would clip the arrow.
        "z-[120] max-w-[min(20rem,calc(100vw-16px))] break-words [text-wrap:pretty] rounded-md border border-ink/10 bg-black-800 px-2 py-1 text-[11px] font-sans text-fg shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-[--radix-tooltip-content-transform-origin]",
        className
      )}
      {...props}
    >
      <span data-tip-text>{children}</span>
      {/* Points at the control it explains, even when the box is aligned to an
          edge or pushed aside by the screen edge (TASK-69). Same fill and edge
          as the box; it overlaps the box's border by 1px so the two read as one. */}
      <TooltipPrimitive.Arrow asChild width={10} height={5}>
        <svg viewBox="0 0 10 5" aria-hidden className="-translate-y-px overflow-visible">
          <path d="M0 0L5 5L10 0Z" className="fill-black-800" />
          <path d="M0 0L5 5L10 0" fill="none" className="stroke-ink/10" />
        </svg>
      </TooltipPrimitive.Arrow>
    </TooltipPrimitive.Content>
  </TooltipPrimitive.Portal>
  )
})
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
