import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { Icon } from "~src/components/ui/icon"

/**
 * A line of fine print led by an icon (TASK-103.6; the sign-in page's privacy promise): 12px subtle
 * text on a relaxed line, the 14px icon nudged 1px down so it sits on the first line's text.
 */
export function IconText({ icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-fg-subtle text-xs leading-relaxed">
      <Icon icon={icon} size="sm" className="mt-px text-fg-subtle" />
      {children}
    </p>
  )
}
