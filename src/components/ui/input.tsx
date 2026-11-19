import * as React from "react"
import { Icon } from "~src/components/ui/icon"
import { Eye, EyeOff, Search } from "lucide-react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "~src/lib/utils"

/**
 * The one field box (TASK-57), taken from the approved header search field:
 * a faint fill and a 1px ink/10 edge, 6px radius, no shadow. Its resting edge
 * stays below 3:1 on purpose: every field is identified by something else, a
 * visible label, a leading search icon (SearchField), or it only exists while
 * focused (inline create/rename), which WCAG 1.4.11 accepts. Focus firms the
 * edge to ink/50 (3.4:1 light, 5.8:1 dark): one neutral focus for every field,
 * never the accent. An invalid field (aria-invalid) takes the danger edge.
 */
const fieldFrame = "rounded-md border border-ink/10 bg-ink/5 transition-colors"

const inputVariants = cva("flex w-full font-sans outline-none disabled:cursor-not-allowed disabled:opacity-50", {
  variants: {
    variant: {
      // Form field (TASK-57): the approved header search look for every field.
      default: `h-9 px-3 py-1 text-sm text-fg placeholder:text-fg-subtle ${fieldFrame} focus-visible:border-ink/50 aria-[invalid=true]:border-danger`,
      // The same field at the popup panel's size (44px, 15px text, like
      // SearchField "panel"), for a page's one main field (TASK-98 clean slate).
      // Pairs with Button size "xl".
      lg: `h-11 px-3.5 py-1 text-[15px] text-fg placeholder:text-fg-subtle ${fieldFrame} focus-visible:border-ink/50 aria-[invalid=true]:border-danger`,
      // Inline create / rename (TASK-62): bare text that sits exactly where the
      // row's label sits. The row around it draws the field (`inlineEditFrame`),
      // so the field adds no padding, height or accent of its own. Font size and
      // weight come from the call site, matching the label it replaces.
      inline:
        "h-auto min-w-0 border-0 bg-transparent p-0 text-fg shadow-none placeholder:text-fg-subtle",
    },
  },
  defaultVariants: { variant: "default" },
})

/**
 * The row that holds an inline field, drawn like the approved header search
 * field: a faint fill and a 1px neutral edge that firms up on focus, never the
 * accent (a red accent ring around an empty field reads as an error). An
 * inset outline, not a border, so the row keeps its exact size and the text
 * stays in the label column; outlines also survive forced-colors mode.
 */
export const inlineEditFrame =
  "rounded-md bg-ink/5 outline outline-1 -outline-offset-1 outline-ink/10 focus-within:outline-ink/50"

/** Read to screen readers in place of the old visible "Enter to create · Esc to cancel" line. */
export const INLINE_CREATE_HINT = "Enter to create, Escape to cancel"

export interface InputProps
  extends React.ComponentProps<"input">,
    VariantProps<typeof inputVariants> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, variant, type, ...props }, ref) => (
    <input type={type} ref={ref} className={cn(inputVariants({ variant }), className)} {...props} />
  ),
)
Input.displayName = "Input"

/**
 * A search/find field (TASK-57): the field box with a leading search icon
 * (what identifies a field that has no visible label) and an optional
 * trailing slot (a clear button). The input inside is bare; the box draws
 * the edge, the focus and the invalid state for it. "panel" is the popup's
 * size (TASK-72): 44px, 14px radius, 15px text.
 */
export interface SearchFieldProps extends Omit<InputProps, "size" | "variant"> {
  size?: "default" | "panel"
  trailing?: React.ReactNode
  /** Classes for the box (width, flex), not the input. */
  boxClassName?: string
}

const SearchField = React.forwardRef<HTMLInputElement, SearchFieldProps>(
  ({ size = "default", trailing, boxClassName, className, ...props }, ref) => {
    const panel = size === "panel"
    return (
      <div
        data-search-field
        className={cn(
          "flex items-center focus-within:border-ink/50 has-[[aria-invalid=true]]:border-danger",
          fieldFrame,
          panel ? "h-11 gap-3 rounded-[14px] px-3" : "h-9 gap-2 px-3",
          boxClassName,
        )}
      >
        <Icon icon={Search} size="md" className="text-fg-subtle" />
        {/* A long placeholder ends in "…" when the box is narrow, not mid-word. */}
        <Input ref={ref} variant="inline" className={cn("flex-1 text-ellipsis font-sans", panel ? "text-[15px]" : "text-sm", className)} {...props} />
        {trailing}
      </div>
    )
  },
)
SearchField.displayName = "SearchField"

/**
 * A password field: the field box with a trailing show/hide button, so a typo
 * can be checked before submitting. The button names its next action ("Show
 * password" / "Hide password") and never takes the field's focus away.
 */
export interface PasswordFieldProps extends Omit<InputProps, "type" | "variant"> {
  /** Classes for the box (width, flex), not the input. */
  boxClassName?: string
}

const PasswordField = React.forwardRef<HTMLInputElement, PasswordFieldProps>(
  ({ boxClassName, className, ...props }, ref) => {
    const [shown, setShown] = React.useState(false)
    return (
      <div
        data-password-field
        className={cn("flex h-9 items-center gap-1 pl-3 pr-1 focus-within:border-ink/50 has-[[aria-invalid=true]]:border-danger", fieldFrame, boxClassName)}
      >
        <Input ref={ref} type={shown ? "text" : "password"} variant="inline" className={cn("flex-1 text-sm", className)} {...props} />
        <button
          type="button"
          aria-label={shown ? "Hide password" : "Show password"}
          aria-controls={props.id}
          onMouseDown={e => e.preventDefault()}
          onClick={() => setShown(s => !s)}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-fg-subtle outline-none hover:text-fg-muted focus-visible:ring-1 focus-visible:ring-ink/50"
        >
          <Icon icon={shown ? EyeOff : Eye} size="md" />
        </button>
      </div>
    )
  },
)
PasswordField.displayName = "PasswordField"

export { Input, PasswordField, SearchField }
