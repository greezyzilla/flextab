import { useEffect, useRef, useState } from "react"
import { useUIStore } from "~src/store/useUIStore"

/**
 * Point at a tab or group that search revealed (TASK-14): once the section
 * scroll settles, bring it to the middle of the view and outline it for a
 * moment. Returns the element ref to attach and whether to show the outline.
 */
export function useFlash<T extends HTMLElement>(kind: "tab" | "group", id: string) {
  const target = useUIStore((s) => s.flashTarget)
  const ref = useRef<T | null>(null)
  const [on, setOn] = useState(false)
  const hit = target?.kind === kind && target.id === id ? target.nonce : null
  useEffect(() => {
    if (hit === null) return
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const show = setTimeout(() => { ref.current?.scrollIntoView?.({ block: "center", behavior: reduce ? "auto" : "smooth" }); setOn(true) }, 350)
    const hide = setTimeout(() => setOn(false), 2400)
    return () => { clearTimeout(show); clearTimeout(hide) }
  }, [hit])
  return { ref, on }
}
