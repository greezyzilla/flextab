// Destination cascade for space → project → category (+ optional group).
// Two explicit policies (FE-B6):
//   select-existing  — pick first existing node; never create (Save Session modal)
//   ensure-or-create — create Default Project/Category/Group when missing (DnD drop)
import { v7 as uuidv7 } from "uuid";
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore";
import type { SavedSpace } from "~src/types";
import type { SaveTabsTarget } from "~src/services/saveTabsAsGroup";

export type PreferredTarget = {
  spaceId?: string | null;
  projectId?: string | null;
  categoryId?: string | null;
};

const DEFAULT_PROJECT = "Default Project";
const DEFAULT_CATEGORY = "Default Category";
const DEFAULT_GROUP = "Default Group";

/**
 * Pure cascade: walk preferred ids when valid, else first child at each level.
 * Never mutates. Missing levels → empty string ids (caller blocks save).
 */
export function resolveSaveTargetIds(
  spaces: SavedSpace[],
  preferred: PreferredTarget = {},
): SaveTabsTarget {
  const space =
    (preferred.spaceId && spaces.find((s) => s.id === preferred.spaceId)) ||
    spaces[0];
  const projects = space?.projects ?? [];
  const project =
    (preferred.projectId && projects.find((p) => p.id === preferred.projectId)) ||
    projects[0];
  const categories = project?.categories ?? [];
  const category =
    (preferred.categoryId &&
      categories.find((c) => c.id === preferred.categoryId)) ||
    categories[0];
  return {
    spaceId: space?.id ?? "",
    projectId: project?.id ?? "",
    categoryId: category?.id ?? "",
  };
}

/**
 * Ensure space has at least one project, category, and group for drop targets.
 * Creates "Default *" nodes when missing. Returns null if spaceId is unknown.
 */
export function ensureSaveTargetPath(
  spaceId: string,
  preferred: { projectId?: string; categoryId?: string } = {},
): { spaceId: string; projectId: string; categoryId: string; groupId: string } | null {
  const store = useSavedSpacesStore.getState();
  const space = store.savedSpaces.find((s) => s.id === spaceId);
  if (!space) return null;

  // Project
  let projectId = preferred.projectId;
  if (!projectId || !space.projects.some((p) => p.id === projectId)) {
    if (space.projects.length > 0) {
      projectId = space.projects[0].id;
    } else {
      projectId = uuidv7();
      store.addSavedProject(spaceId, {
        id: projectId,
        name: DEFAULT_PROJECT,
        categories: [],
      });
    }
  }

  // Category (re-read after possible create)
  let project = useSavedSpacesStore
    .getState()
    .savedSpaces.find((s) => s.id === spaceId)
    ?.projects.find((p) => p.id === projectId);
  let categoryId = preferred.categoryId;
  if (!categoryId || !project?.categories.some((c) => c.id === categoryId)) {
    if (project && project.categories.length > 0) {
      categoryId = project.categories[0].id;
    } else {
      categoryId = uuidv7();
      store.addSavedCategory(spaceId, projectId, {
        id: categoryId,
        name: DEFAULT_CATEGORY,
        groups: [],
      });
    }
  }

  // Group
  const category = useSavedSpacesStore
    .getState()
    .savedSpaces.find((s) => s.id === spaceId)
    ?.projects.find((p) => p.id === projectId)
    ?.categories.find((c) => c.id === categoryId);
  let groupId: string;
  if (category && category.groups.length > 0) {
    groupId = category.groups[0].id;
  } else {
    groupId = uuidv7();
    store.addSavedGroup(spaceId, projectId, categoryId, {
      id: groupId,
      name: DEFAULT_GROUP,
      tabs: [],
    });
  }

  return { spaceId, projectId, categoryId, groupId };
}
