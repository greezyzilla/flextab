import { useEffect } from "react"

interface DrawerProps {
  side: "left" | "right"
  open: boolean
  onClose: () => void
  children: React.ReactNode
}

/**
 * Slide-in overlay panel used to host the navigation / opened-tabs panels on
 * narrow viewports. Rendered inline in the React tree (not portaled) so that
 * dnd-kit drag sensors keep working across the drawer boundary.
 *
 * The left drawer is offset by the always-visible 64px ProfilePanel so the
 * space switcher stays reachable.
 */
export function Drawer({ side, open, onClose, children }: DrawerProps) {
  // Close on Escape for keyboard users.
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [open, onClose])

  const positionClass =
    side === "left" ? "left-16 border-r" : "right-0 border-l"
  // Hidden state must clear the viewport edge fully. The left drawer is shifted
  // right by the 64px (4rem) ProfilePanel, so it has to travel its own width
  // PLUS that offset to disappear — otherwise a sliver peeks over the profile.
  const hiddenTransform =
    side === "left" ? "translate-x-[calc(-100%-4rem)]" : "translate-x-full"

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-hidden
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-200 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      {/* Sliding panel */}
      <div
        className={`fixed top-0 ${positionClass} z-50 h-full bg-black-900 border-black-800 shadow-2xl transition-transform duration-200 ease-out ${
          open ? "translate-x-0" : `${hiddenTransform} pointer-events-none`
        }`}
      >
        {children}
      </div>
    </>
  )
}
