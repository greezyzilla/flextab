import type { SavedSpace } from "~src/types";
import { findUnsorted, isUnsortedGroup, orderedGroups } from "~src/lib/defaultPath";

/**
 * The shape of the new tab as it was last seen (TASK-106): counts and choices only, never a name,
 * address or title. The workspace store is async (chrome.storage), so the loading shell reads this
 * copy from localStorage before the first render and draws the user's own layout: as many spaces,
 * projects (open or closed), categories, Unsorted trays, groups, tabs and windows as there were,
 * in list or grid. When the data arrives it lands in the same places.
 */
export type ShellShape = {
  /** Spaces on the rail. */
  spaces: number;
  /** The active space's projects, in order. `categories` holds each category's group count (its tree badge). */
  projects: { open: boolean; categories: number[] }[];
  /** The selected category in the tree: [project index, category index]. */
  active: [number, number] | null;
  /** The content column, from the active category down. Null: no category to show. */
  content: {
    layout: "list" | "grid";
    gridColumns: number;
    /** The breadcrumb's list/grid toggle shows only when the project has groups. */
    projectHasGroups: boolean;
    /** One per category section: its Unsorted tray's tab count (null: no tray) and each group's tab count. */
    sections: { unsorted: number | null; groups: number[] }[];
  } | null;
  /** Opened tabs: tab count per window. */
  windows: number[];
};

export const SHELL_SHAPE_STORAGE_KEY = "flextab-shell-shape";

/**
 * Real counts, bounded only so a huge workspace keeps the copy small. The skeleton stops drawing at
 * the screen's height (ShellSkeleton), so these never decide what shows.
 */
const CAP = { spaces: 50, projects: 50, categories: 50, sections: 6, groups: 40, tabs: 200, windows: 10 };
const clamp = (n: number, max: number) => Math.max(0, Math.min(Math.floor(n), max));

type WorkspaceState = {
  savedSpaces: SavedSpace[];
  activeSpaceId: string | null;
  activeProjectId: string | null;
  activeCategoryId: string | null;
  expandedProjectIds: string[];
};

/** The workspace part of the shape, from the store and the group layout settings. */
export function workspaceShape(s: WorkspaceState, layout: "list" | "grid", gridColumns: number): Omit<ShellShape, "windows"> {
  const byOrder = <T extends { order?: number }>(xs: T[]) => [...xs].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const space = s.savedSpaces.find((sp) => sp.id === s.activeSpaceId);
  const projects = space ? byOrder(space.projects) : [];
  let active: [number, number] | null = null;
  const tree = projects.slice(0, CAP.projects).map((p, pi) => {
    const categories = byOrder(p.categories);
    const ci = p.id === s.activeProjectId ? categories.findIndex((c) => c.id === s.activeCategoryId) : -1;
    if (ci >= 0) active = [pi, ci];
    return {
      open: s.expandedProjectIds.includes(p.id),
      categories: categories.slice(0, CAP.categories).map((c) => c.groups.filter((g) => !isUnsortedGroup(g)).length),
    };
  });
  const project = projects.find((p) => p.id === s.activeProjectId);
  const categories = project ? byOrder(project.categories) : [];
  const from = Math.max(0, categories.findIndex((c) => c.id === s.activeCategoryId));
  const content = project && categories.length > 0 ? {
    layout,
    gridColumns: clamp(gridColumns, 6) || 2,
    projectHasGroups: categories.some((c) => c.groups.length > 0),
    sections: categories.slice(from, from + CAP.sections).map((c) => {
      const unsorted = findUnsorted(c);
      return {
        unsorted: unsorted ? clamp(unsorted.tabs.length, CAP.tabs) : null,
        groups: orderedGroups(c.groups).filter((g) => !isUnsortedGroup(g)).slice(0, CAP.groups).map((g) => clamp(g.tabs.length, CAP.tabs)),
      };
    }),
  } : null;
  return { spaces: clamp(s.savedSpaces.length, CAP.spaces), projects: tree, active, content };
}

export function windowsShape(tabCounts: number[]): number[] {
  return tabCounts.slice(0, CAP.windows).map((n) => clamp(n, CAP.tabs));
}

/**
 * Cuts the shape where it passes the bottom of the screen, so a big workspace draws only what can
 * be seen. Each budget counts rows at their shortest (Compact) plus two to spare, and a grid counts
 * every tab as if it had all its columns, so the cut always falls below the fold.
 */
export function fitToScreen(shape: ShellShape, height: number): ShellShape {
  const rows = (rowHeight: number) => Math.ceil(height / rowHeight) + 2
  // The tree: 32px rows.
  let tree = rows(32)
  const projects: ShellShape["projects"] = []
  for (const p of shape.projects) {
    if (tree <= 0) break
    tree -= 1
    const categories = p.open ? p.categories.slice(0, Math.max(0, tree)) : []
    tree -= categories.length
    projects.push({ open: p.open, categories })
  }
  // Opened tabs: a 56px window row, then 45px tab rows.
  let side = rows(43)
  const windows: number[] = []
  for (const n of shape.windows) {
    if (side <= 0) break
    side -= 2
    const t = Math.max(0, Math.min(n, side))
    side -= t
    windows.push(t)
  }
  // The content: saved-tab rows (39px at their shortest with the gap), headers counted as two rows.
  let content = shape.content
  if (content) {
    const perRow = content.layout === "grid" ? Math.max(1, content.gridColumns) : 1
    let budget = rows(39) * perRow
    const take = (n: number) => { const t = Math.max(0, Math.min(n, budget)); budget -= t + 2 * perRow; return t }
    const sections: NonNullable<ShellShape["content"]>["sections"] = []
    for (const sec of content.sections) {
      if (budget <= 0) break
      budget -= 2 * perRow
      const unsorted = sec.unsorted === null ? null : take(sec.unsorted)
      const groups: number[] = []
      for (const g of sec.groups) { if (budget <= 0) break; groups.push(take(g)) }
      sections.push({ unsorted, groups })
    }
    content = { ...content, sections }
  }
  return { ...shape, spaces: Math.min(shape.spaces, rows(52)), projects, windows, content }
}

const isCount = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v >= 0;
const isCounts = (v: unknown) => Array.isArray(v) && v.every(isCount);

function valid(x: unknown): x is ShellShape {
  const s = x as ShellShape;
  if (!s || !isCount(s.spaces) || !isCounts(s.windows) || !Array.isArray(s.projects)) return false;
  if (!s.projects.every((p) => p && typeof p.open === "boolean" && isCounts(p.categories))) return false;
  if (s.active !== null && !(Array.isArray(s.active) && s.active.length === 2 && isCounts(s.active))) return false;
  if (s.content === null) return true;
  const c = s.content;
  return !!c && (c.layout === "list" || c.layout === "grid") && isCount(c.gridColumns) && typeof c.projectHasGroups === "boolean"
    && Array.isArray(c.sections) && c.sections.every((sec) => sec && (sec.unsorted === null || isCount(sec.unsorted)) && isCounts(sec.groups));
}

export function readStoredShellShape(): ShellShape | null {
  try {
    const raw = localStorage.getItem(SHELL_SHAPE_STORAGE_KEY);
    if (!raw) return null;
    const shape = JSON.parse(raw);
    return valid(shape) ? shape : null;
  } catch {
    return null;
  }
}

/** Merges one part (workspace or windows) into the stored copy; a part not given keeps its last value. */
export function storeShellShape(part: Partial<ShellShape>) {
  try {
    const base: ShellShape = readStoredShellShape() ?? { spaces: 0, projects: [], active: null, content: null, windows: [] };
    localStorage.setItem(SHELL_SHAPE_STORAGE_KEY, JSON.stringify({ ...base, ...part }));
  } catch {
    // Storage blocked: the loading shell falls back to its sample shape.
  }
}
