// Destination cascade for space → project → category (+ group).
// One policy everywhere (TASK-1): projects and categories are only created by
// the user naming them (inline in the sidebar or the destination picker);
// resolution never invents them. A missing level is surfaced, not papered over.
import { v7 as uuidv7 } from "uuid";
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore";
import type { SavedSpace } from "~src/types";
import type { SaveTabsTarget } from "~src/services/saveTabsAsGroup";

export type PreferredTarget = {
  spaceId?: string | null;
  projectId?: string | null;
  categoryId?: string | null;
};

/** Same name the "+ New group" button uses, so auto and manual groups match. */
export const NEW_GROUP_NAME = "New Group";

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

/** A ready drop/save destination, down to the group that receives tabs. */
export type SaveTargetPath = {
  spaceId: string;
  projectId: string;
  categoryId: string;
  groupId: string;
};

/**
 * Why a destination could not be resolved: the user still has to name the
 * project or category. Structure is never invented on their behalf.
 */
export type MissingLevel =
  | { missing: "project"; spaceId: string }
  | { missing: "category"; spaceId: string; projectId: string };

export function isMissingLevel(r: SaveTargetPath | MissingLevel): r is MissingLevel {
  return "missing" in r;
}

/**
 * Resolve a drop target down to a group. Walks the preferred project/category
 * (else the first existing one). Projects and categories are named structure,
 * so they are never auto-created: a missing level is reported back for the UI
 * to ask the user. Only the group (the tab container) is created on demand,
 * because dropping tabs into a category is itself the request for one.
 * Returns null if spaceId is unknown.
 */
export function ensureSaveTargetPath(
  spaceId: string,
  preferred: { projectId?: string; categoryId?: string } = {},
): SaveTargetPath | MissingLevel | null {
  const store = useSavedSpacesStore.getState();
  const space = store.savedSpaces.find((s) => s.id === spaceId);
  if (!space) return null;

  const project =
    (preferred.projectId && space.projects.find((p) => p.id === preferred.projectId)) ||
    space.projects[0];
  if (!project) return { missing: "project", spaceId };

  const category =
    (preferred.categoryId && project.categories.find((c) => c.id === preferred.categoryId)) ||
    project.categories[0];
  if (!category) return { missing: "category", spaceId, projectId: project.id };

  let groupId: string;
  if (category.groups.length > 0) {
    groupId = [...category.groups].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0].id;
  } else {
    groupId = uuidv7();
    store.addSavedGroup(spaceId, project.id, category.id, {
      id: groupId,
      name: NEW_GROUP_NAME,
      tabs: [],
      order: 0,
    });
  }

  return { spaceId, projectId: project.id, categoryId: category.id, groupId };
}
