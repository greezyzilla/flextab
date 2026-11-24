import { useEffect } from "react"
import { REVEAL_REQUEST_KEY, takeRevealRequest } from "~src/services/reveal"

/**
 * The dashboard side of the popup's "Open in FlexTab": reveal a
 * request addressed to this tab, whether it was left before this page loaded
 * or arrives while it is open. Waits for the workspace (`ready`) so the
 * place it points at exists.
 */
export function useRevealRequests(ready: boolean): void {
  useEffect(() => {
    if (!ready) return
    let myTabId: number | undefined
    let alive = true
    const onStorage = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === "session" && changes[REVEAL_REQUEST_KEY]?.newValue) void takeRevealRequest(myTabId, changes[REVEAL_REQUEST_KEY].newValue)
    }
    void (async () => {
      try {
        myTabId = (await chrome.tabs.getCurrent())?.id
        const stored = await chrome.storage.session.get(REVEAL_REQUEST_KEY)
        if (alive) await takeRevealRequest(myTabId, stored[REVEAL_REQUEST_KEY])
      } catch { /* no extension APIs: nothing to reveal */ }
    })()
    chrome.storage?.onChanged?.addListener(onStorage)
    return () => {
      alive = false
      chrome.storage?.onChanged?.removeListener(onStorage)
    }
  }, [ready])
}
