// Default path (TASK-20): saving a tab must always work in one action, so the
// system carries the structure. Missing levels above the tabs are created as
// ordinary, renamable items; the level that holds tabs gets the one special
// group per category, "Unsorted" (tabs saved without a chosen group). Works on
// the Yjs doc directly, so the page, the popup and the background worker all
// share it.
import { v7 as uuidv7 } from "uuid"
import * as yjs from "~src/lib/yjsDoc"
import type { SavedCategory, SavedGroup } from "~src/types"

export const DEFAULT_PROJECT_NAME = "General"
export const DEFAULT_CATEGORY_NAME = "Uncategorized"
export const UNSORTED_NAME = "Unsorted"

export type CategoryPath = { spaceId: string; projectId: string; categoryId: string }

export function isUnsortedGroup(group: Pick<SavedGroup, "config"> | undefined): boolean {
  return group?.config?.kind === "unsorted"
}

export function findUnsorted(category: Pick<SavedCategory, "groups"> | undefined): SavedGroup | undefined {
  return category?.groups.find(isUnsortedGroup)
}

/**
 * The category to save into: the preferred project/category when they exist,
 * else the first existing one, creating "General" / "Uncategorized" only for
 * a level that has none. Null only if the space itself is unknown.
 */
export function ensureCategoryPath(
  spaceId: string,
  preferred: { projectId?: string | null; categoryId?: string | null } = {},
): CategoryPath | null {
  const space = yjs.getSpaces().find((s) => s.id === spaceId)
  if (!space) return null

  let project = (preferred.projectId && space.projects.find((p) => p.id === preferred.projectId)) || space.projects[0]
  if (!project) {
    project = { id: uuidv7(), name: DEFAULT_PROJECT_NAME, categories: [], order: 0 }
    yjs.addProject(spaceId, project)
  }

  let category = (preferred.categoryId && project.categories.find((c) => c.id === preferred.categoryId)) || project.categories[0]
  if (!category) {
    category = { id: uuidv7(), name: DEFAULT_CATEGORY_NAME, groups: [], order: 0 }
    yjs.addCategory(spaceId, project.id, category)
  }

  return { spaceId, projectId: project.id, categoryId: category.id }
}

/** The category's Unsorted group id, creating it (first, empty) if needed. */
export function ensureUnsortedGroup(path: CategoryPath): string | null {
  const category = yjs.getSpaces().find((s) => s.id === path.spaceId)
    ?.projects.find((p) => p.id === path.projectId)
    ?.categories.find((c) => c.id === path.categoryId)
  if (!category) return null
  const existing = findUnsorted(category)
  if (existing) return existing.id
  const id = uuidv7()
  yjs.addGroup(path.spaceId, path.projectId, path.categoryId, {
    id, name: UNSORTED_NAME, tabs: [], order: -1, config: { kind: "unsorted" },
  })
  return id
}

/** Default path down to the tabs: the category from ensureCategoryPath plus its Unsorted. */
export function ensureUnsortedPath(
  spaceId: string,
  preferred: { projectId?: string | null; categoryId?: string | null } = {},
): (CategoryPath & { groupId: string }) | null {
  const path = ensureCategoryPath(spaceId, preferred)
  if (!path) return null
  // The category was just ensured, so its Unsorted can always be created.
  return { ...path, groupId: ensureUnsortedGroup(path)! }
}

/** Groups in display order: Unsorted first, then the user's groups by order. */
export function orderedGroups<T extends Pick<SavedGroup, "config" | "order">>(groups: T[]): T[] {
  return [...groups].sort((a, b) =>
    Number(isUnsortedGroup(b)) - Number(isUnsortedGroup(a)) || (a.order ?? 0) - (b.order ?? 0))
}
