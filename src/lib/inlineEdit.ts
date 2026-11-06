/**
 * Blur handler for the inline "name it" rows (TASK-22). Clicking elsewhere in
 * the page commits the typed name, the same as everywhere else in the app,
 * but a blur caused by the browser window losing focus (switching apps or
 * windows) does not: the row stays open with the text and focus comes back
 * to it when the user returns.
 */
export function commitOnBlur(commit: () => void): () => void {
  return () => {
    if (typeof document !== "undefined" && !document.hasFocus()) return
    commit()
  }
}
