import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

import { cn } from "~src/lib/utils"

const TooltipProvider = TooltipPrimitive.Provider

const Tooltip = TooltipPrimitive.Root

const TooltipTrigger = TooltipPrimitive.Trigger

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, collisionPadding = 8, children, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
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
      {children}
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
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
