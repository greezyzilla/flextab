/**
 * Which browser runs FlexTab. Firefox is the one with
 * runtime.getBrowserInfo; Chrome and the Chromium browsers (Edge, Brave, Opera)
 * do not have it. Checked at run time, so `plasmo dev` needs no build flag.
 */
export function isFirefox(): boolean {
  return typeof chrome !== "undefined" && typeof (chrome.runtime as { getBrowserInfo?: unknown } | undefined)?.getBrowserInfo === "function"
}

/** The browser's name for copy that points at its own screens ("Anywhere in Firefox"). */
export function browserName(): "Firefox" | "Chrome" {
  return isFirefox() ? "Firefox" : "Chrome"
}

/** Opens the browser's own page for changing extension shortcuts. */
export function openShortcutSettings(): void {
  try {
    const commands = chrome.commands as { openShortcutSettings?: () => Promise<void> } | undefined
    // Firefox (137+) opens about:addons > Manage Extension Shortcuts, which an extension cannot open by URL.
    if (typeof commands?.openShortcutSettings === "function") void commands.openShortcutSettings().catch(() => {})
    else void chrome.tabs.create({ url: "chrome://extensions/shortcuts" })
  } catch (_) { /* no extension context */ }
}
