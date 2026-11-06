import { useMemo } from "react"
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore"
import { buildSavedUrlIndex, type SavedLocation } from "~src/lib/savedUrlIndex"

/** The saved-URL index of the current workspace, rebuilt when it changes. */
export function useSavedUrlIndex(): Map<string, SavedLocation[]> {
  const savedSpaces = useSavedSpacesStore((s) => s.savedSpaces)
  return useMemo(() => buildSavedUrlIndex(savedSpaces), [savedSpaces])
}
