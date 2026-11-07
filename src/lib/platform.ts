// Keyboard labels that match the user's platform (TASK-13): ⌘ on macOS,
// Ctrl elsewhere. Chrome's own shortcut strings ("Alt+Shift+S") are turned
// into the same style so every list reads alike.

export function isMac(): boolean {
  // userAgentData is the current API; navigator.platform the older fallback.
  const nav = navigator as Navigator & { userAgentData?: { platform: string } }
  return /mac/i.test(nav.userAgentData?.platform || nav.platform)
}

const MAC_SYMBOLS: Record<string, string> = { Command: "⌘", Ctrl: "⌃", MacCtrl: "⌃", Alt: "⌥", Option: "⌥", Shift: "⇧" }

/** Split a shortcut like "Alt+Shift+S" or "Mod+K" into the keys to show. */
export function shortcutKeys(shortcut: string, mac = isMac()): string[] {
  // Chrome on macOS reports commands as symbols without "+" ("⌥⇧S").
  const parts = shortcut.includes("+") ? shortcut.split("+") : shortcut.match(/[⌘⌥⇧⌃]|[^⌘⌥⇧⌃]+/g) ?? []
  return parts.filter(Boolean).map((part) => {
    if (part === "Mod") return mac ? "⌘" : "Ctrl"
    return mac ? (MAC_SYMBOLS[part] ?? part) : part === "Command" ? "Ctrl" : part
  })
}

/** "⌘K" on macOS, "Ctrl+K" elsewhere. */
export function shortcutLabel(shortcut: string, mac = isMac()): string {
  return shortcutKeys(shortcut, mac).join(mac ? "" : "+")
}
