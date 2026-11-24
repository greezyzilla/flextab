// The one modal family (docs/modal-standard.md). Every modal renders through these parts,
// so anatomy, sizes, spacing, type, buttons and focus are the same everywhere. Call sites pass
// content, never spacing classes.
import * as React from "react"
import { Icon } from "~src/components/ui/icon"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog"
import { TriangleAlert, X } from "lucide-react"
import { cn } from "~src/lib/utils"
import { Button } from "~src/components/ui/button"
import { Label } from "~src/components/ui/label"
import { RadioGroupItem } from "~src/components/ui/radio-group"
import { Checkbox } from "~src/components/ui/checkbox"
import { TextLink } from "~src/components/ui/text-link"

export type ModalKind = "dialog" | "alert"
export type ModalSize = "s" | "m" | "l"
/** Where focus lands on open (§8). "auto" follows the standard's order; "dialog" focuses the
 *  modal itself, for a passive sheet where no control should be highlighted before use. */
export type ModalFocus = "auto" | "cancel" | "close" | "primary" | "dialog"

const SIZE: Record<ModalSize, string> = { s: "w-[400px]", m: "w-[480px]", l: "w-[720px]" }

const ModalContext = React.createContext<{ kind: ModalKind; dismissible: boolean }>({ kind: "dialog", dismissible: true })

const TEXT_FIELD = 'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([disabled]), textarea:not([disabled])'

/**
 * Focus on open (§8): a text field, else Cancel in an alert, else the selected (or first) radio,
 * else a primary that does not destroy, else Cancel, else the close button.
 */
export function modalFocusTarget(root: HTMLElement, rule: ModalFocus, kind: ModalKind): HTMLElement | null {
  const q = (s: string) => root.querySelector<HTMLElement>(s)
  const cancel = q("[data-modal-cancel]:not([disabled])")
  const primary = q("[data-modal-primary]:not([disabled])")
  const close = q("[data-modal-close]")
  if (rule === "dialog") return null
  if (rule === "cancel") return cancel
  if (rule === "close") return close
  if (rule === "primary") return primary
  const field = q(TEXT_FIELD)
  if (field) return field
  if (kind === "alert" && cancel) return cancel
  const radio = q('[role="radio"][data-state="checked"]:not([disabled])') ?? q('[role="radio"]:not([disabled])')
  if (radio) return radio
  if (primary && primary.dataset.modalTone !== "destructive") return primary
  return cancel ?? close
}

/**
 * What focus should return to. A modal opened from a menu item returns to the menu's trigger
 * (the "⋯" button): the item is gone once the menu closes. Radix labels the menu by its trigger.
 */
export function openerOf(el: Element | null): HTMLElement | null {
  if (!(el instanceof HTMLElement) || el === document.body) return null
  const menu = el.closest('[role="menu"]')
  const triggerId = menu?.getAttribute("aria-labelledby")
  if (menu) return (triggerId && document.getElementById(triggerId)) || null
  return el
}

/**
 * True when a key event comes from inside a modal. A modal owns the keyboard (§8), so page-wide
 * shortcuts must not act on the page behind it.
 */
export function isInsideModal(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("[data-modal]") !== null
}

export function Modal({
  kind, size, open, onOpenChange, dirty = false, dismissible = true, initialFocus = "auto", children,
}: {
  kind: ModalKind
  size: ModalSize
  open: boolean
  onOpenChange: (open: boolean) => void
  /** A field was edited: an outside click must not discard it (Primer). */
  dirty?: boolean
  /** False for a forced decision: Esc does nothing and there is no Cancel. */
  dismissible?: boolean
  initialFocus?: ModalFocus
  children: React.ReactNode
}) {
  const P = kind === "alert" ? AlertDialogPrimitive : DialogPrimitive
  // Return focus to what opened the modal (§8). Radix only does this for its own Trigger, and
  // these modals open from state, so remember the focused element on the render that opens the
  // modal, before Radix moves focus inside (its focus scope runs in effects, after this render).
  const returnTo = React.useRef<HTMLElement | null>(null)
  const wasOpen = React.useRef(false)
  if (open && !wasOpen.current) returnTo.current = openerOf(document.activeElement)
  wasOpen.current = open
  const contentProps = {
    "data-modal": "",
    className: cn(
      // Centred by margin, not transform: the open/close animation owns transform, and a
      // translate here would be overwritten mid-animation (the modal flew in from the bottom right).
      "fixed inset-0 z-[100] m-auto h-fit",
      SIZE[size], "max-w-[calc(100vw-32px)] max-h-[85vh] flex flex-col gap-4 p-5",
      "rounded-xl border border-ink/10 bg-black-900 text-fg font-sans shadow-[0_18px_50px_-16px_rgba(0,0,0,0.6)] outline-none",
      "duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-bottom-4 data-[state=open]:slide-in-from-bottom-4",
    ),
    onOpenAutoFocus: (e: Event) => {
      e.preventDefault()
      const root = e.currentTarget as HTMLElement
      ;(modalFocusTarget(root, initialFocus, kind) ?? root).focus()
    },
    onCloseAutoFocus: (e: Event) => {
      const el = returnTo.current
      if (el && el.isConnected && el !== document.body) { e.preventDefault(); el.focus() }
    },
    onEscapeKeyDown: (e: KeyboardEvent) => { if (!dismissible) e.preventDefault() },
    ...(kind === "dialog" ? { onPointerDownOutside: (e: Event) => { if (dirty || !dismissible) e.preventDefault() } } : {}),
  }
  return (
    <P.Root open={open} onOpenChange={onOpenChange}>
      <P.Portal>
        <P.Overlay className="fixed inset-0 z-[100] bg-overlay backdrop-blur-[8px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <P.Content {...contentProps}>
          <ModalContext.Provider value={{ kind, dismissible }}>
            {children}
            {kind === "dialog" && dismissible && (
              <DialogPrimitive.Close data-modal-close
                className="absolute right-3.5 top-3.5 flex h-7 w-7 items-center justify-center rounded-md text-fg-subtle outline-none transition-colors hover:bg-ink/10 hover:text-fg focus-visible:ring-1 focus-visible:ring-ring">
                <Icon icon={X} size="md" />
                <span className="sr-only">Close</span>
              </DialogPrimitive.Close>
            )}
          </ModalContext.Provider>
        </P.Content>
      </P.Portal>
    </P.Root>
  )
}

export function ModalHeader({ title, description }: { title: React.ReactNode; description?: React.ReactNode }) {
  const { kind, dismissible } = React.useContext(ModalContext)
  const P = kind === "alert" ? AlertDialogPrimitive : DialogPrimitive
  return (
    <div className={cn("flex flex-col gap-1.5 shrink-0", kind === "dialog" && dismissible && "pr-8")}>
      <P.Title className="text-base font-semibold leading-6 text-fg">{title}</P.Title>
      {description !== undefined && <P.Description className="text-sm leading-5 text-fg-muted">{description}</P.Description>}
    </div>
  )
}

/** The scroll area (§3). Hairlines show above and below only while it scrolls. */
export function ModalBody({ children }: { children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [scrolls, setScrolls] = React.useState(false)
  React.useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === "undefined") return
    const check = () => setScrolls(el.scrollHeight > el.clientHeight + 1)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div ref={ref} data-scrolls={scrolls || undefined}
      className={cn("-mx-5 flex min-h-0 flex-col gap-4 overflow-y-auto px-5", scrolls && "border-y border-line py-4")}>
      {children}
    </div>
  )
}

/** Items that belong together: 8px apart (§5). */
export function ModalGroup({ children, label }: { children: React.ReactNode; label?: string }) {
  return <div role={label ? "group" : undefined} aria-label={label} className="flex flex-col gap-2">{children}</div>
}

/** A field caption and its control: 6px apart (§5). */
export function ModalField({ label, htmlFor, children }: { label: React.ReactNode; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}

/** Small print in a modal (§6): notes and footnotes, 12px subtle. */
export function ModalNote({ children }: { children: React.ReactNode }) {
  return <p className="text-xs leading-4 text-fg-subtle">{children}</p>
}

export type ModalPrimary = {
  label: React.ReactNode
  onClick: () => void
  tone?: "primary" | "destructive"
  disabled?: boolean
}

/**
 * Footer (§7): [start] … [Cancel] [Primary]. Cancel closes; the primary never closes by itself,
 * the caller decides (it may validate or wait).
 */
export function ModalFooter({ start, cancel = "Cancel", cancelDisabled, primary, quiet = false }: {
  start?: React.ReactNode
  cancel?: React.ReactNode | false
  cancelDisabled?: boolean
  primary?: ModalPrimary
  /**
   * For a step that leaves rather than goes ahead (Sign out): the primary is neutral, not the
   * accent, Cancel is ghost so the two neutral buttons differ by shape, and the primary keeps one width
   * when it turns destructive, so Cancel never moves.
   */
  quiet?: boolean
}) {
  const { kind, dismissible } = React.useContext(ModalContext)
  const CancelPrimitive = kind === "alert" ? AlertDialogPrimitive.Cancel : DialogPrimitive.Close
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
      {start && <div className="mr-auto flex min-w-0 items-center text-xs text-fg-subtle">{start}</div>}
      {cancel !== false && dismissible && (
        <CancelPrimitive asChild>
          <Button type="button" variant={quiet ? "ghost" : "secondary"} data-modal-cancel disabled={cancelDisabled}>{cancel}</Button>
        </CancelPrimitive>
      )}
      {primary && (
        <Button type="button" variant={primary.tone === "destructive" ? "destructive" : quiet ? "secondary" : "default"}
          className={quiet ? "min-w-28" : undefined}
          data-modal-primary data-modal-tone={primary.tone ?? "primary"} disabled={primary.disabled} onClick={primary.onClick}>
          {/* A primary that turns destructive gains an icon, so the change shows even
              when the accent is red like the destructive fill. */}
          {primary.tone === "destructive" && <Icon icon={TriangleAlert} size="md" data-modal-danger-icon="" />}
          {primary.label}
        </Button>
      )}
    </div>
  )
}

/** A footer-start action (§7): reads as an action, underline visible at rest. */
export const ModalLink = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, ...props }, ref) => <TextLink ref={ref} tone="muted" size="sm" className={className} {...props} />)
ModalLink.displayName = "ModalLink"

/** A radio choice on one line (§6): 14px text, an optional count after a middle dot. */
export function ModalRadio({ id, value, children, count, disabled }: {
  id: string; value: string; children: React.ReactNode; count?: React.ReactNode; disabled?: boolean
}) {
  return (
    <Label htmlFor={id} className="flex min-h-6 cursor-pointer items-center gap-2.5 text-sm leading-5 text-fg">
      <RadioGroupItem value={value} id={id} disabled={disabled} />
      <span>{children}{count !== undefined && <span className="text-fg-subtle"> · {count}</span>}</span>
    </Label>
  )
}

/** A checkbox choice on one line (§6): 14px text, laid out like ModalRadio. */
export function ModalCheckbox({ checked, onCheckedChange, disabled, children }: {
  checked: boolean; onCheckedChange: (checked: boolean) => void; disabled?: boolean; children: React.ReactNode
}) {
  const id = React.useId()
  return (
    <Label htmlFor={id} className="flex min-h-6 cursor-pointer items-center gap-2.5 text-sm leading-5 text-fg">
      <Checkbox id={id} checked={checked} disabled={disabled} onChange={(e) => onCheckedChange(e.target.checked)} />
      <span>{children}</span>
    </Label>
  )
}

/**
 * A radio choice with a sentence of explanation, drawn as a card (§6). The chosen one is always the
 * accent, a destroying choice included: its label says what it removes and the destructive primary
 * carries the red (danger-standard §3). A second red on the card told no one anything new.
 */
export function ModalOptionCard({ id, value, selected, title, hint, aside, disabled }: {
  id: string; value: string; selected: boolean; title: React.ReactNode; hint?: React.ReactNode
  aside?: React.ReactNode; disabled?: boolean
}) {
  return (
    <Label htmlFor={id}
      className={cn(
        "flex cursor-pointer items-start gap-2.5 rounded-lg border px-4 py-2.5 transition-colors",
        selected ? "border-[var(--accent)] bg-[var(--accent-subtle)]" : "border-ink/10 hover:bg-ink/[0.03]",
      )}>
      <RadioGroupItem value={value} id={id} className="mt-0.5" disabled={disabled} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm leading-5 text-fg">{title}</span>
        {hint && <span className="text-xs leading-4 text-fg-subtle">{hint}</span>}
      </span>
      {aside && <span className="shrink-0 self-center text-xs text-fg-subtle">{aside}</span>}
    </Label>
  )
}
