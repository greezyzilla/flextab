/**
 * How a new version reaches open FlexTab pages. Background only.
 *
 * The browser downloads an update on its own schedule. With an
 * onUpdateAvailable listener it waits for us to apply it, which we do only:
 *   1. when no FlexTab page is the active tab of the focused window, so nobody
 *      is in the middle of using it (checked again on every tab/window switch
 *      and by an alarm), and
 *   2. after every open FlexTab page and the background have finished their
 *      writes (workspace, settings merge base, a token refresh in flight).
 *
 * A reload drops every open FlexTab page: an overriding new tab falls back to
 * the browser's own new tab page, a tab at a chrome-extension:// URL closes.
 * So the open FlexTab tabs are recorded before the reload and brought back by
 * restoreTabsAfterUpdate() when the new version starts.
 *
 * A browser restart applies a waiting update too; that path needs no restore.
 */
/** Sent to every open FlexTab page before the reload; see services/updatePrepare.ts. */
export const PREPARE_UPDATE_MESSAGE = "flextab:prepare-update"
/** A page asks the background to install the waiting update even with FlexTab in front. */
export const APPLY_UPDATE_NOW_MESSAGE = "flextab:apply-update-now"
/** Set by that message: the next ready update applies without waiting for a safe moment. */
export const UPDATE_FORCE_KEY = "flextab_update_force"
export const UPDATE_READY_KEY = "flextab_update_ready"
export const RESTORE_TABS_KEY = "flextab_update_restore_tabs"
export const UPDATE_ALARM = "flextab_update_apply"
const FLUSH_TIMEOUT_MS = 5000

/** The URL an overriding new tab reports, and the browser's own new tab page it falls back to. */
const NEW_TAB_URL = "chrome://newtab/"
const BROWSER_NEW_TAB_URLS = [NEW_TAB_URL, "chrome://new-tab-page/"]

export interface RestoreTab {
  id: number
  windowId: number
  index: number
  url: string
  active: boolean
  /** "newtab": an overriding new tab, reloaded in place. "page": a chrome-extension:// tab, reopened. */
  kind: "newtab" | "page"
}

export function flexTabKind(url: string | undefined, extensionOrigin: string): RestoreTab["kind"] | null {
  if (!url) return null
  if (url.startsWith(extensionOrigin)) return "page"
  if (url === NEW_TAB_URL) return "newtab"
  return null
}

const extensionOrigin = () => chrome.runtime.getURL("")
const tabUrl = (tab: chrome.tabs.Tab) => tab.url || tab.pendingUrl

/** The open FlexTab tabs, in a form that survives the reload. */
export async function openFlexTabTabs(): Promise<RestoreTab[]> {
  const origin = extensionOrigin()
  const tabs = await chrome.tabs.query({})
  return tabs.flatMap((tab) => {
    const url = tabUrl(tab)
    const kind = flexTabKind(url, origin)
    if (!kind || tab.id === undefined || !url) return []
    return [{ id: tab.id, windowId: tab.windowId, index: tab.index, url, active: tab.active, kind }]
  })
}

/** False while a FlexTab page is the active tab of the focused window. */
export async function updateIsSafe(): Promise<boolean> {
  const win = await chrome.windows.getLastFocused({ populate: true }).catch(() => null)
  if (!win?.focused) return true
  const active = win.tabs?.find((tab) => tab.active)
  return !active || !flexTabKind(tabUrl(active), extensionOrigin())
}

function withTimeout(work: Promise<unknown>, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    void work.finally(() => { clearTimeout(timer); resolve() })
  })
}

export interface UpdateDeps {
  /** The background's own writes: the structured push and a token refresh in flight. */
  flushBackground: () => Promise<void>
  reload: () => void
}

let applying = false

/** Applies a waiting update when it is safe; otherwise leaves it for the next check. */
export async function tryApplyUpdate(deps: UpdateDeps): Promise<boolean> {
  if (applying) return false
  const stored = await chrome.storage.local.get([UPDATE_READY_KEY, UPDATE_FORCE_KEY])
  const ready = stored[UPDATE_READY_KEY]
  // The user asked for it ("Check for update"): no waiting for FlexTab to leave the front.
  const force = Boolean(stored[UPDATE_FORCE_KEY])
  const safe = () => (force ? Promise.resolve(true) : updateIsSafe())
  if (!ready || !(await safe())) return false
  applying = true
  try {
    const pages = await openFlexTabTabs()
    await withTimeout(Promise.allSettled([
      ...pages.map((tab) => chrome.tabs.sendMessage(tab.id, { type: PREPARE_UPDATE_MESSAGE })),
      deps.flushBackground(),
    ]), FLUSH_TIMEOUT_MS)
    // The user may have come back to FlexTab while the writes finished.
    if (!(await safe())) return false
    await chrome.storage.local.set({ [RESTORE_TABS_KEY]: await openFlexTabTabs() })
    deps.reload()
    return true
  } finally {
    applying = false
  }
}

/** Brings back the FlexTab tabs an update reload dropped. Runs once the new version starts. */
export async function restoreTabsAfterUpdate(): Promise<void> {
  const tabs = ((await chrome.storage.local.get(RESTORE_TABS_KEY))[RESTORE_TABS_KEY] ?? []) as RestoreTab[]
  await chrome.storage.local.remove([RESTORE_TABS_KEY, UPDATE_READY_KEY, UPDATE_FORCE_KEY])
  await chrome.alarms.clear(UPDATE_ALARM)
  for (const saved of tabs) {
    const tab = await chrome.tabs.get(saved.id).catch(() => null)
    if (saved.kind === "newtab") {
      // Only a tab still on the browser's new tab page: one the user has taken elsewhere stays.
      const url = tab && tabUrl(tab)
      if (url && BROWSER_NEW_TAB_URLS.includes(url)) await chrome.tabs.update(saved.id, { url: NEW_TAB_URL }).catch(() => {})
    } else if (!tab) {
      await chrome.tabs.create({ windowId: saved.windowId, index: saved.index, url: saved.url, active: saved.active }).catch(() => {})
    }
  }
}

/** Listens for an update and applies it at the first safe moment. */
export function installUpdateFlow(deps: UpdateDeps): void {
  const check = () => { void tryApplyUpdate(deps).catch(() => {}) }
  chrome.runtime.onUpdateAvailable.addListener((details) => {
    void chrome.storage.local.set({ [UPDATE_READY_KEY]: { version: details.version, at: Date.now() } }).then(() => {
      chrome.alarms.create(UPDATE_ALARM, { periodInMinutes: 1 })
      check()
    })
  })
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (message?.type !== APPLY_UPDATE_NOW_MESSAGE || sender.id !== chrome.runtime.id) return
    void chrome.storage.local.set({ [UPDATE_FORCE_KEY]: true }).then(check)
  })
  chrome.tabs.onActivated.addListener(check)
  chrome.windows.onFocusChanged.addListener(check)
  chrome.alarms.onAlarm.addListener((alarm) => { if (alarm.name === UPDATE_ALARM) check() })
}
