import { toast } from "sonner"
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore"
import { useUIStore } from "~src/store/useUIStore"
import type { MissingLevel } from "~src/services/resolveSaveTarget"

/**
 * A save/drop needed a project or category that does not exist yet. Instead of
 * inventing a placeholder, take the user to the sidebar's inline "name it" row
 * for that level. `then` runs once the chain has produced a category (a new
 * project chains straight into naming its first category), so the original
 * action finishes without the user repeating it.
 */
export function requestMissingLevel(missing: MissingLevel, then?: () => void): void {
  const store = useSavedSpacesStore.getState()
  const space = store.savedSpaces.find((s) => s.id === missing.spaceId)
  if (!space) return

  if (store.activeSpaceId !== space.id) store.setActiveSpace(space.id)

  if (missing.missing === "project") {
    useUIStore.getState().startCreate({ kind: "project", spaceId: space.id, then })
    toast(`Name a project in ${space.name}`, {
      description: "Then name its first category to finish saving.",
    })
    return
  }

  const project = space.projects.find((p) => p.id === missing.projectId)
  if (!project) return
  if (store.activeProjectId !== project.id) store.setActiveProject(project.id)
  if (!useSavedSpacesStore.getState().expandedProjectIds.includes(project.id)) {
    store.toggleExpandedProject(project.id)
  }
  useUIStore.getState().startCreate({
    kind: "category",
    spaceId: space.id,
    projectId: project.id,
    then,
  })
  toast(`Name a category in ${project.name}`, { description: "Then the tabs land there." })
}
