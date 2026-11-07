import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu"
import { useEffect } from "react"
import { Check } from "lucide-react"
import type { GroupColor } from "~src/types"
import { GROUP_COLORS, groupColorFill } from "~src/lib/groupColors"

const NONE = "none"

/**
 * The items of a group's "Colour" submenu (TASK-18): None plus the nine
 * colours, one radio choice each. Every choice shows its swatch and its name
 * (never colour alone, WCAG 1.4.1), and the current one carries a check.
 */
export function GroupColorMenuItems({ value, onChange, onPreview }: {
  value?: GroupColor
  onChange: (c: GroupColor | undefined) => void
  /** The highlighted choice, shown on the group live ("none" = no colour); null when the submenu closes. */
  onPreview?: (c: GroupColor | "none" | null) => void
}) {
  // The submenu unmounts when it closes: drop the preview then.
  useEffect(() => () => onPreview?.(null), [])
  return (
    <DropdownMenuPrimitive.RadioGroup
      value={value ?? NONE}
      onValueChange={(v) => onChange(v === NONE ? undefined : (v as GroupColor))}
    >
      <ColorItem value={NONE} label="None" onPreview={onPreview} />
      {GROUP_COLORS.map((c) => <ColorItem key={c.id} value={c.id} label={c.label} fill={groupColorFill(c.id)} onPreview={onPreview} />)}
    </DropdownMenuPrimitive.RadioGroup>
  )
}

function ColorItem({ value, label, fill, onPreview }: { value: string; label: string; fill?: string; onPreview?: (c: GroupColor | "none" | null) => void }) {
  return (
    <DropdownMenuPrimitive.RadioItem
      value={value}
      // Radix focuses the highlighted item (pointer or keyboard).
      onFocus={() => onPreview?.(value as GroupColor | "none")}
      className="flex min-w-36 cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground"
    >
      <GroupColorSwatch fill={fill} />
      <span className="flex-1">{label}</span>
      <DropdownMenuPrimitive.ItemIndicator>
        <Check className="h-3.5 w-3.5" aria-hidden />
      </DropdownMenuPrimitive.ItemIndicator>
    </DropdownMenuPrimitive.RadioItem>
  )
}

/** A colour's swatch; without a fill, the empty ring that means "no colour". */
export function GroupColorSwatch({ fill, className = "h-3 w-3" }: { fill?: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={`shrink-0 rounded-full ${fill ? "ring-1 ring-inset ring-ink/15" : "border border-ink/40"} ${className}`}
      style={fill ? { backgroundColor: fill } : undefined}
    />
  )
}
