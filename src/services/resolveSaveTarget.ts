// Destination cascade for space → project → category (+ group).
// One policy everywhere: a save always lands somewhere. Missing
// levels get default, renamable items and tabs without a chosen group go to
// the category's Unsorted group (lib/defaultPath).
import { ensureUnsortedPath } from "~src/lib/defaultPath";
import type { SavedSpace } from "~src/types";
import type { SaveTabsTarget } from "~src/services/saveTabsAsGroup";

export type PreferredTarget = {
  spaceId?: string | null;
  projectId?: string | null;
  categoryId?: string | null;
};

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
 * Resolve a drop target down to a group: the preferred / first
 * project and category, created as "General" / "Uncategorized" when a level
 * is missing, and that category's Unsorted group. Saving never dead-ends.
 * Returns null only if the space is unknown.
 */
export function ensureSaveTargetPath(
  spaceId: string,
  preferred: { projectId?: string; categoryId?: string } = {},
): SaveTargetPath | null {
  return ensureUnsortedPath(spaceId, preferred);
}
