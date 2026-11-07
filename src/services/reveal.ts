// "Show in FlexTab" (TASK-14): take the workspace to where something lives,
// the way a person would walk there: the space, its project (opened in the
// sidebar), the category's section, then point at the tab or group.

import { navigate } from "~src/lib/route"
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore"
import { useUIStore } from "~src/store/useUIStore"

export interface RevealTarget {
  spaceId: string
  projectId?: string
  categoryId?: string
  /** Point at this tab or group once there. */
  flash?: { kind: "tab" | "group"; id: string }
}

export function revealInWorkspace(target: RevealTarget): void {
  // Anywhere but the workspace ("#/settings/…"): go back to it first.
  if (window.location.hash.replace(/^#\/?/, "")) navigate("/")
  const store = useSavedSpacesStore.getState()
  if (store.activeSpaceId !== target.spaceId) store.setActiveSpace(target.spaceId)
  if (target.projectId) {
    if (useSavedSpacesStore.getState().activeProjectId !== target.projectId) useSavedSpacesStore.getState().setActiveProject(target.projectId)
    if (!useSavedSpacesStore.getState().expandedProjectIds.includes(target.projectId)) useSavedSpacesStore.getState().toggleExpandedProject(target.projectId)
  }
  const ui = useUIStore.getState()
  if (target.categoryId) {
    useSavedSpacesStore.getState().setActiveCategory(target.categoryId)
    ui.requestScrollToCategory(target.categoryId, "top")
  }
  if (target.flash) ui.flash(target.flash.kind, target.flash.id)
}
