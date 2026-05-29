/**
 * Tab Utilities for Flextab Extension
 */

// Use Chrome's native Tab type for better compatibility
export type TabInfo = chrome.tabs.Tab

export interface TabGroup {
  id: number
  title?: string
  color: chrome.tabGroups.ColorEnum
  collapsed: boolean
  windowId: number
}

/**
 * Tab Event Listeners and Monitoring
 */
export class TabEventManager {
  static onTabUpdated(callback: (tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => void): void {
    chrome.tabs.onUpdated.addListener(callback)
  }

  static removeTabUpdatedListener(callback: (tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => void): void {
    chrome.tabs.onUpdated.removeListener(callback)
  }

  static onTabCreated(callback: (tab: chrome.tabs.Tab) => void): void {
    chrome.tabs.onCreated.addListener(callback)
  }

  static removeTabCreatedListener(callback: (tab: chrome.tabs.Tab) => void): void {
    chrome.tabs.onCreated.removeListener(callback)
  }

  static onTabRemoved(callback: (tabId: number, removeInfo: chrome.tabs.TabRemoveInfo) => void): void {
    chrome.tabs.onRemoved.addListener(callback)
  }

  static removeTabRemovedListener(callback: (tabId: number, removeInfo: chrome.tabs.TabRemoveInfo) => void): void {
    chrome.tabs.onRemoved.removeListener(callback)
  }

  static onTabActivated(callback: (activeInfo: chrome.tabs.TabActiveInfo) => void): void {
    chrome.tabs.onActivated.addListener(callback)
  }

  static removeTabActivatedListener(callback: (activeInfo: chrome.tabs.TabActiveInfo) => void): void {
    chrome.tabs.onActivated.removeListener(callback)
  }

  static onTabMoved(callback: (tabId: number, moveInfo: chrome.tabs.TabMoveInfo) => void): void {
    chrome.tabs.onMoved.addListener(callback)
  }

  static removeTabMovedListener(callback: (tabId: number, moveInfo: chrome.tabs.TabMoveInfo) => void): void {
    chrome.tabs.onMoved.removeListener(callback)
  }
}
