import * as React from "react"
import { Plus } from "lucide-react"
import { cva, type VariantProps } from "class-variance-authority"

import { Icon, type IconSize } from "~src/components/ui/icon"
import { cn } from "~src/lib/utils"

/**
 * A "create here" slot (TASK-62, shared in TASK-103.4): it opens a name field instead of selecting,
 * so it differs from the rows around it by shape, not colour — a dashed outline (the app's "empty
 * slot / add here" language, like the rail's Add space), muted text, a + and an ellipsis (more input
 * follows). Its geometry matches the row that replaces it, so naming moves nothing. `size` is the
 * surface it sits on:
 *   sidebar — the project list (13px; the + in the project icon column).
 *   dialog  — a picker in a dialog (12px).
 *   panel   — the popup panel (15px, 36px tall, 10px corners).
 */
const createSlotVariants = cva(
  "flex w-full items-center border border-dashed border-ink/15 text-left text-fg-subtle outline-none transition-colors hover:border-ink/35 hover:bg-ink/[0.03] hover:text-fg",
  {
    variants: {
      size: {
        sidebar: "gap-2 rounded-md py-[5px] pl-[23px] pr-[7px] font-sans text-[13px] focus-visible:ring-1 focus-visible:ring-ring",
        dialog: "gap-2 rounded-md px-[7px] py-[3px] text-xs focus-visible:ring-1 focus-visible:ring-ring",
        panel: "min-h-9 gap-3 rounded-[10px] px-[7px] text-[15px] focus-visible:ring-2 focus-visible:ring-ring",
      },
    },
    defaultVariants: { size: "dialog" },
  },
)

const ICON: Record<NonNullable<VariantProps<typeof createSlotVariants>["size"]>, IconSize> = { sidebar: "sm", dialog: "sm", panel: "md" }

export interface CreateSlotProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof createSlotVariants> {
  /** What it creates, without the ellipsis ("New project"). */
  children: React.ReactNode
  /** The + takes the icon size of the items it creates (a category's is smaller than a project's). */
  iconSize?: IconSize
}

const CreateSlot = React.forwardRef<HTMLButtonElement, CreateSlotProps>(({ className, size, iconSize, children, ...props }, ref) => (
  <button ref={ref} type="button" className={cn(createSlotVariants({ size }), className)} {...props}>
    <Icon icon={Plus} size={iconSize ?? ICON[size ?? "dialog"]} />
    <span className="truncate">{children}…</span>
  </button>
))
CreateSlot.displayName = "CreateSlot"

export { CreateSlot, createSlotVariants }
