import { SECTION_LABEL, isSettingsRoute, tabFromRoute } from "~src/components/settings/types"
import { SIGN_IN_ROUTE } from "~src/lib/workspaceAccess"

/**
 * What an Opened Tabs row prints for an open tab: a name, and the address
 * under it when the address says something the name doesn't.
 *
 * Chrome gives a tab with no title of its own (a page without <title>, an
 * error page, one not loaded yet) its address as the title, as host + path
 * without the scheme. Printed as a title, that is an address cut at the end.
 * Such a tab is named by its site instead, with the address under it, like
 * every other row; an untitled page off the web (a blank page, data, page
 * source, another extension's page, a local file) is named for what it is.
 * An offloaded (discarded) tab keeps its title, so it needs
 * nothing of its own. A tab opened blank that is still loading its first page
 * has only a pendingUrl: it is named from there.
 */
export function openTabText(tab: Pick<chrome.tabs.Tab, "title" | "url" | "pendingUrl">): { name: string; address?: string } {
  // A tab opened blank and still on its way somewhere: where it is going.
  const blank = !tab.url || tab.url === "about:blank"
  const url = (blank && tab.pendingUrl) || tab.url || ""
  const title = blank && tab.pendingUrl && tab.title === "about:blank" ? "" : (tab.title ?? "").trim()
  let site = ""
  try {
    const u = new URL(url)
    if (u.protocol === "http:" || u.protocol === "https:") site = u.hostname.replace(/^www\./, "")
  } catch { /* not a URL: a name from the title or the address as it is */ }
  const plain = (s: string) => {
    let t = s
    try { t = decodeURI(s) } catch { /* keep it as given */ }
    return t.replace(/^https?:\/\//i, "").replace(/^www\./, "").replace(/\/+$/, "").toLowerCase()
  }
  const addressOnly = !title || plain(title) === plain(url) || (!!site && plain(title) === site)
  if (!addressOnly) return { name: title, address: url || undefined }
  if (site) return { name: site, address: url }
  // Pages that are not on the web and have no title of their own: named for
  // what they are, the address under it.
  const kind = pageKind(url)
  if (kind) return { name: kind, address: url }
  return { name: url || title || "New tab" }
}

/** A name for an untitled page that is not on the web, or null to print its address. */
function pageKind(url: string): string | null {
  if (url === "about:blank") return "Blank page"
  if (/^data:/i.test(url)) return "Data page"
  if (/^chrome-extension:/i.test(url)) return "Extension page"
  if (/^view-source:/i.test(url)) {
    try {
      const host = new URL(url.slice("view-source:".length)).hostname.replace(/^www\./, "")
      if (host) return `Source of ${host}`
    } catch { /* falls through */ }
    return "Page source"
  }
  if (/^file:/i.test(url)) {
    const last = url.replace(/^file:\/*/i, "").replace(/\/+$/, "").split("/").pop()!
    if (!last) return "Local file"
    try { return decodeURIComponent(last) } catch { return last }
  }
  return null
}

/**
 * A FlexTab page in Opened Tabs: named for which page it is, with "FlexTab"
 * where other rows show their address (its machine address stays out of view).
 * Settings pages use the section names Settings shows.
 */
export function flexTabPageText(url: string): { name: string; address: string } {
  return { name: flexTabPageName(url), address: "FlexTab" }
}

function flexTabPageName(url: string): string {
  if (/^chrome:\/\/newtab\b/i.test(url)) return "New tab"
  let u: URL
  try { u = new URL(url) } catch { return "FlexTab" }
  const page = u.pathname.replace(/^\/+/, "")
  if (page.startsWith("popup")) return "Popup"
  if (page.startsWith("options")) return "Settings"
  const route = u.hash.replace(/^#/, "") || "/"
  if (isSettingsRoute(route)) return `Settings · ${SECTION_LABEL[tabFromRoute(route)]}`
  if (route === SIGN_IN_ROUTE) return "Sign in"
  return "New tab"
}

/** A FlexTab page (the new tab, Settings, …): it is named FlexTab, never by its extension address. */
export function isFlexTabPage(url?: string): boolean {
  if (!url) return false
  if (/^chrome:\/\/newtab\/?$/.test(url)) return true
  const own = chrome.runtime?.getURL?.("") ?? ""
  return !!own && url.startsWith(own)
}

/** What an Opened Tabs row prints for a tab, FlexTab pages included; its drag card prints the same. */
export function openTabRowText(tab: Pick<chrome.tabs.Tab, "title" | "url" | "pendingUrl">): { name: string; address?: string } {
  // isFlexTabPage is false without a url, so the url is there on that side.
  return isFlexTabPage(tab.url) ? flexTabPageText(tab.url as string) : openTabText(tab)
}
