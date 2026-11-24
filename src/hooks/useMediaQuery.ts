import { useSyncExternalStore } from "react"

/**
 * Reactive media query hook backed by window.matchMedia.
 * Re-renders whenever the query's match state changes (e.g. window resize,
 * monitor change, split-screen). Future-proof: pass any CSS media query.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = (callback: () => void) => {
    const mql = window.matchMedia(query)
    mql.addEventListener("change", callback)
    return () => mql.removeEventListener("change", callback)
  }
  const getSnapshot = () => window.matchMedia(query).matches
  // Extensions render client-side only; default to false on the server path.
  const getServerSnapshot = () => false

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

/**
 * Layout breakpoints for the app shell, aligned with Tailwind's defaults.
 * - Right (Opened Tabs) panel docks inline at >= lg (1024px), drawer below.
 * - Left (navigation) panel docks inline at >= md (768px), drawer below.
 * The narrow ProfilePanel (64px) stays inline at every size.
 */
export const RIGHT_INLINE_QUERY = "(min-width: 1024px)"
export const LEFT_INLINE_QUERY = "(min-width: 768px)"

export function useShellLayout() {
  const rightInline = useMediaQuery(RIGHT_INLINE_QUERY)
  const leftInline = useMediaQuery(LEFT_INLINE_QUERY)
  return { leftInline, rightInline }
}
