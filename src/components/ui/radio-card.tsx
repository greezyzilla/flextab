import * as React from "react"

import { Label } from "~src/components/ui/label"
import { RadioGroupItem } from "~src/components/ui/radio-group"
import { cn } from "~src/lib/utils"

/**
 * A choice drawn as a card (TASK-103.6; the merge conflict dialog's "which version to keep"): the
 * whole card is the label, its radio sits on the first line, and the chosen card takes the accent
 * edge and fill. `wide` spans both columns of a RadioGroup layout="grid". Children: the choice's
 * own text.
 */
export function RadioCard({ id, value, selected, wide = false, children }: {
  id: string
  value: string
  selected: boolean
  wide?: boolean
  children: React.ReactNode
}) {
  return (
    <Label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2 font-normal transition-colors",
        wide && "sm:col-span-2",
        selected ? "border-[var(--accent)] bg-[var(--accent-subtle)]" : "border-ink/10 bg-ink/[0.02] hover:bg-ink/[0.05]",
      )}
    >
      <RadioGroupItem value={value} id={id} className="mt-0.5" />
      {children}
    </Label>
  )
}
