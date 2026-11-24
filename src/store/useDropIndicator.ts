import { create } from "zustand"
import type { Edge } from "~src/services/moveTo"

/**
 * Where a dragged project or category would be inserted: the drop
 * zone id of the row it sits next to, and on which side. That row gets no
 * highlight, which would mean "inside"; the list shows the new order instead
 * (useContainerPreview).
 */
interface DropIndicatorState {
  zone: string | null
  edge: Edge | null
  show: (zone: string | null, edge: Edge | null) => void
}

export const useDropIndicator = create<DropIndicatorState>((set, get) => ({
  zone: null,
  edge: null,
  show: (zone, edge) => {
    if (get().zone === zone && get().edge === edge) return
    set({ zone, edge })
  },
}))
