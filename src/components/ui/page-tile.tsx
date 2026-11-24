import * as React from "react"
import { Check } from "lucide-react"

import { Icon } from "~src/components/ui/icon"

/**
 * The popup's 44px tile for the page in front: its favicon at 22px (an <img> child is
 * sized here, whatever its own default) or a state icon, on a faint square. `done` adds the green
 * check on the corner: the page is saved.
 */
export function PageTile({ done, children }: { done?: boolean; children: React.ReactNode }) {
  return (
    <span className="relative grid h-11 w-11 place-items-center rounded-popup-tile bg-ink/[0.06] [&>img]:h-[22px] [&>img]:w-[22px]">
      {children}
      {done && <span className="absolute -bottom-1 -right-1 grid h-[18px] w-[18px] place-items-center rounded-full bg-success ring-2 ring-black-900"><Icon icon={Check} size="badge-lg" className="text-black-900" /></span>}
    </span>
  )
}
