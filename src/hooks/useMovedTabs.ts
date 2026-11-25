import { useEffect } from "react"
import { create } from "zustand"
import { normalizeUrl } from "~src/lib/savedUrlIndex"
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore"
import { useUIStore } from "~src/store/useUIStore"
import { findLinkedTab, JUST_UPDATED_KEY, OPEN_LINKS_KEY, readOpenLinks } from "~src/services/openLinks"

/** The open page a saved tab's browser tab has moved on to. */
export interface MovedTab { url: string; title?: string; favIconUrl?: string }

/** Saved tab id -> the page its open browser tab is on now, for every saved tab whose tab moved. */
export const useMovedTabs = create<{ moved: Record<string, MovedTab> }>(() => ({ moved: {} }))

/**
 * Keeps useMovedTabs current while the dashboard is open, so a card can show
 * "Update to Episode 02" without being opened first (one look at the group
 * shows which shows moved on). Refreshes when a tab's address or title
 * changes, when a tab closes, when links change, and when saved tabs change.
 * Also outlines a saved tab the popup just updated, once the dashboard is
 * in view.
 */
export function useWatchMovedTabs(): void {
  const spaces = useSavedSpacesStore((s) => s.savedSpaces)

  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = async () => {
      const links = await readOpenLinks()
      const moved: Record<string, MovedTab> = {}
      for (const [id, link] of Object.entries(links)) {
        const card = findLinkedTab(useSavedSpacesStore.getState().savedSpaces, link)
        if (!card) continue
        try {
          const tab = await chrome.tabs.get(Number(id))
          if (tab?.url && normalizeUrl(tab.url) !== normalizeUrl(card.url)) {
            moved[link.tabId] = { url: tab.url, title: tab.title, favIconUrl: tab.favIconUrl }
          }
        } catch { /* closed */ }
      }
      if (alive) useMovedTabs.setState({ moved })
    }
    const soon = () => { clearTimeout(timer); timer = setTimeout(() => void refresh(), 150) }
    soon()

    const onUpdated = (_id: number, change: chrome.tabs.OnUpdatedInfo) => { if (change.url || change.title) soon() }
    const onStorage = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== "session") return
      if (changes[OPEN_LINKS_KEY]) soon()
      const just = changes[JUST_UPDATED_KEY]?.newValue as { id?: string } | undefined
      if (just?.id) pointAt(just.id)
    }
    // Outline it now if the dashboard is in view, else when it comes back.
    let pending: string | null = null
    const pointAt = (id: string) => {
      if (document.visibilityState === "visible") useUIStore.getState().flash("tab", id)
      else pending = id
    }
    const onVisible = () => {
      if (document.visibilityState === "visible" && pending) { useUIStore.getState().flash("tab", pending); pending = null }
    }
    chrome.tabs?.onUpdated?.addListener(onUpdated)
    chrome.tabs?.onRemoved?.addListener(soon)
    chrome.storage?.onChanged?.addListener(onStorage)
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      alive = false
      clearTimeout(timer)
      chrome.tabs?.onUpdated?.removeListener(onUpdated)
      chrome.tabs?.onRemoved?.removeListener(soon)
      chrome.storage?.onChanged?.removeListener(onStorage)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [spaces])
}
