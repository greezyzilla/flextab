import { create } from "zustand"
import type { Edge } from "~src/services/moveTo"

/**
 * A project or category dragged within its own parent: the sibling it
 * would land next to, and on which side. The sidebar shows the list in that
 * order while dragging (the rows move aside, its own slot dimmed where it will
 * land), and the drop commits exactly this, as Opened Tabs does.
 */
export interface ContainerPreview { kind: "project" | "category"; id: string; next: string; edge: Edge }

interface ContainerPreviewState {
  preview: ContainerPreview | null
  show: (preview: ContainerPreview | null) => void
}

export const useContainerPreview = create<ContainerPreviewState>((set, get) => ({
  preview: null,
  show: (preview) => {
    const now = get().preview
    if (now?.id === preview?.id && now?.next === preview?.next && now?.edge === preview?.edge && now?.kind === preview?.kind) return
    set({ preview })
  },
}))

/** A list as the sidebar shows it during the preview: the dragged item moved next to `next`. */
export function inPreviewOrder<T extends { id: string }>(list: T[], kind: ContainerPreview["kind"], preview: ContainerPreview | null): T[] {
  if (!preview || preview.kind !== kind) return list
  const item = list.find((x) => x.id === preview.id)
  const rest = list.filter((x) => x.id !== preview.id)
  const at = rest.findIndex((x) => x.id === preview.next)
  if (!item || at < 0) return list
  const index = preview.edge === "before" ? at : at + 1
  return [...rest.slice(0, index), item, ...rest.slice(index)]
}
