import { useEffect, useSyncExternalStore } from "react"

/**
 * Whether Alt (Option on macOS) is held, for previews that open only on demand
 * (TASK-80). One set of window listeners serves every card, attached only while
 * some card asks. A lost keyup (Alt+Tab away, the window losing focus) can't
 * leave it stuck: blur, a hidden page and any key or pointer event without Alt
 * reset it.
 */
let held = false
/** Cards under the pointer or keyboard focus that use Alt: while any is, a lone
 *  Alt press is swallowed so Windows/Linux don't move focus to the browser menu. */
let armed = 0
const listeners = new Set<() => void>()

function set(next: boolean) {
  if (held === next) return
  held = next
  listeners.forEach((l) => l())
}
const onKeyDown = (e: KeyboardEvent) => {
  if (e.key === "Alt") {
    if (armed > 0) e.preventDefault()
    set(true)
  } else set(e.altKey)
}
const onKeyUp = (e: KeyboardEvent) => {
  if (e.key !== "Alt") return
  if (armed > 0) e.preventDefault()
  set(false)
}
const onPointer = (e: PointerEvent) => set(e.altKey)
const reset = () => set(false)
const onVisibility = () => { if (document.visibilityState === "hidden") reset() }

function subscribe(listener: () => void) {
  if (listeners.size === 0) {
    window.addEventListener("keydown", onKeyDown, true)
    window.addEventListener("keyup", onKeyUp, true)
    window.addEventListener("pointermove", onPointer, true)
    window.addEventListener("pointerdown", onPointer, true)
    window.addEventListener("blur", reset)
    document.addEventListener("visibilitychange", onVisibility)
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size > 0) return
    window.removeEventListener("keydown", onKeyDown, true)
    window.removeEventListener("keyup", onKeyUp, true)
    window.removeEventListener("pointermove", onPointer, true)
    window.removeEventListener("pointerdown", onPointer, true)
    window.removeEventListener("blur", reset)
    document.removeEventListener("visibilitychange", onVisibility)
    held = false
  }
}
const subscribeNone = () => () => {}
const getHeld = () => held
const getNotHeld = () => false

/** True while Alt is held; always false (and no listeners) when not enabled. */
export function useAltHeld(enabled: boolean): boolean {
  return useSyncExternalStore(enabled ? subscribe : subscribeNone, enabled ? getHeld : getNotHeld)
}

/** Mark this card as the one Alt is aimed at while `active`. */
export function useArmAlt(active: boolean) {
  useEffect(() => {
    if (!active) return
    armed++
    return () => { armed-- }
  }, [active])
}
