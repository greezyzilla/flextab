import { create } from "zustand"
import type { OpenTabPreview } from "~src/services/moveOpenTab"

/**
 * An open tab being dragged in Opened Tabs: the window lists render
 * as if it were already where it would land, so the other rows move aside
 * live, as saved tabs and groups do. Null: shown where it is.
 */
interface OpenTabPreviewState {
  preview: OpenTabPreview | null
  show: (preview: OpenTabPreview | null) => void
}

const key = (p: OpenTabPreview | null) => (p ? `${p.tabId}|${p.slot.windowId}|${p.slot.index}` : "")

export const useOpenTabPreview = create<OpenTabPreviewState>((set, get) => ({
  preview: null,
  show: (preview) => { if (key(get().preview) !== key(preview)) set({ preview }) },
}))
