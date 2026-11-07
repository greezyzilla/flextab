import { useEffect, useState } from "react"

/**
 * The extension's commands as Chrome has them set now (TASK-13). People can
 * change or clear them at chrome://extensions/shortcuts, so anything that
 * names a command's keys reads them here instead of the suggested default.
 * Returns name → shortcut ("" when cleared); empty until Chrome answers.
 */
export function useCommandShortcuts(enabled = true): Record<string, string> {
  const [shortcuts, setShortcuts] = useState<Record<string, string>>({})
  useEffect(() => {
    if (!enabled) return
    let live = true
    try {
      chrome.commands.getAll()
        .then((all) => { if (live) setShortcuts(Object.fromEntries(all.filter((c) => c.name).map((c) => [c.name!, c.shortcut ?? ""]))) })
        .catch(() => { /* no commands API: show nothing */ })
    } catch (_) { /* no extension context */ }
    return () => { live = false }
  }, [enabled])
  return shortcuts
}
