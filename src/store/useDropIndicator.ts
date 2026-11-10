import { create } from "zustand"
import type { Edge } from "~src/services/moveTo"

/**
 * Where a dragged project or category would be inserted (TASK-64): the drop
 * zone id of the row it sits next to, and on which side. The row draws an
 * insertion line there; a highlight would mean "inside" instead.
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
