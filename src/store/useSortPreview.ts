import { create } from "zustand"
import type { SortPreview } from "~src/services/sortPreview"

/**
 * A saved tab or group being dragged into another container: the
 * lists render as if it were already there, so the rows make room live, as
 * they do within one list. Null when the drag stays in its own list (dnd-kit's
 * sortable shows that) or is over anything else.
 */
interface SortPreviewState {
  preview: SortPreview | null
  show: (preview: SortPreview | null) => void
}

/** What the lists show: the same key means nothing to re-render. */
const key = (p: SortPreview | null) => (p ? `${p.kind}|${p.id}|${p.to}|${p.beforeId}` : "")

export const useSortPreview = create<SortPreviewState>((set, get) => ({
  preview: null,
  show: (preview) => { if (key(get().preview) !== key(preview)) set({ preview }) },
}))
