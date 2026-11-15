import { useLayoutEffect, useRef } from "react"
import type { SavedGroup } from "~src/types"

interface DraggedTabGroupProps {
  group: SavedGroup
}

/**
 * A dragged group (TASK-65) travels as a copy of its own card, the size it is
 * on the page, lifted with a shadow: the UI benchmark showed dragged items and
 * containers as themselves at their own size, never re-laid out. The copy is
 * the card's DOM as rendered when the drag starts (header, tabs, colour), so
 * it can never drift from the card. It is inert: nothing in it can be clicked.
 * The card's surface is translucent, so the copy sits on the page colour.
 */
export function DraggedTabGroup({ group }: DraggedTabGroupProps) {
  const holder = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const card = document.querySelector<HTMLElement>(`[data-group-card="${CSS.escape(group.id)}"]`)
    const box = holder.current
    if (!card || !box) return
    const copy = card.cloneNode(true) as HTMLElement
    copy.removeAttribute("data-group-card")
    copy.classList.remove("ring-2", "ring-[var(--accent)]") // a search flash is not part of the card
    for (const el of [copy, ...copy.querySelectorAll("[id]")]) el.removeAttribute("id") // ids stay unique
    box.replaceChildren(copy)
    // Same place inside the overlay as the card inside its sortable row.
    const row = card.parentElement
    if (row && box.parentElement) {
      box.parentElement.style.paddingTop = row.style.paddingTop
      box.parentElement.style.paddingInline = row.style.paddingInline
    }
  }, [group.id])

  return (
    <div aria-hidden inert className="cursor-grabbing">
      <div ref={holder} data-dragged-group={group.id} className="rounded-card bg-black-900 shadow-lg" />
    </div>
  )
}
