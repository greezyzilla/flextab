import { useState } from "react";
import { rectIntersection, pointerWithin } from "@dnd-kit/core";
import type { DragStartEvent, DragEndEvent, CollisionDetection } from "@dnd-kit/core";
import { v7 as uuidv7 } from "uuid";
import type { SavedTab, SavedGroup, SavedSpace } from "~src/types";
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore";
import { faviconToDataUrl } from "~src/utils/favicon";

/** Locate a tab across all spaces/projects/categories. */
function findTabLocation(spaces: SavedSpace[], tabId: string) {
  for (const space of spaces) {
    for (const project of space.projects) {
      for (const category of project.categories) {
        for (const group of category.groups) {
          if (group.tabs.find(t => t.id === tabId)) {
            return { spaceId: space.id, projectId: project.id, categoryId: category.id, groupId: group.id };
          }
        }
      }
    }
  }
  return null;
}

/** Locate a group across all spaces/projects/categories. */
function findGroupLocation(spaces: SavedSpace[], groupId: string) {
  for (const space of spaces) {
    for (const project of space.projects) {
      for (const category of project.categories) {
        if (category.groups.find(g => g.id === groupId)) {
          return { spaceId: space.id, projectId: project.id, categoryId: category.id };
        }
      }
    }
  }
  return null;
}

/** Read fresh state from the store (avoids stale closures in async handlers). */
function getState() {
  const s = useSavedSpacesStore.getState();
  const spaces = s.savedSpaces;
  const currentSpace = spaces.find(sp => sp.id === s.activeSpaceId);
  const currentProject = currentSpace?.projects.find(p => p.id === s.activeProjectId);
  const currentCategory = currentProject?.categories.find(c => c.id === s.activeCategoryId);
  return { spaces, currentSpace, currentProject, currentCategory };
}

/**
 * Ensure a target path has at least a project, category, and group.
 * Creates missing nodes as needed. Returns the resolved IDs, or null if the space doesn't exist.
 */
function ensureDropTarget(
  spaceId: string,
  projectId?: string,
  categoryId?: string,
): { projectId: string; categoryId: string; groupId: string } | null {
  const store = useSavedSpacesStore.getState();
  let spaces = store.savedSpaces;
  const space = spaces.find(s => s.id === spaceId);
  if (!space) return null;

  // Ensure project
  let pId = projectId;
  if (!pId || !space.projects.find(p => p.id === pId)) {
    if (space.projects.length > 0) {
      pId = space.projects[0].id;
    } else {
      pId = uuidv7();
      store.addSavedProject(spaceId, { id: pId, name: "Default Project", categories: [] });
      spaces = useSavedSpacesStore.getState().savedSpaces;
    }
  }

  // Ensure category
  const project = useSavedSpacesStore.getState().savedSpaces.find(s => s.id === spaceId)?.projects.find(p => p.id === pId);
  let cId = categoryId;
  if (!cId || !project?.categories.find(c => c.id === cId)) {
    if (project && project.categories.length > 0) {
      cId = project.categories[0].id;
    } else {
      cId = uuidv7();
      store.addSavedCategory(spaceId, pId!, { id: cId, name: "Default Category", groups: [] });
    }
  }

  // Ensure group
  const category = useSavedSpacesStore.getState().savedSpaces
    .find(s => s.id === spaceId)?.projects.find(p => p.id === pId)
    ?.categories.find(c => c.id === cId);
  let gId: string;
  if (category && category.groups.length > 0) {
    gId = category.groups[0].id;
  } else {
    gId = uuidv7();
    store.addSavedGroup(spaceId, pId!, cId!, { id: gId, name: "Default Group", tabs: [] });
  }

  return { projectId: pId!, categoryId: cId!, groupId: gId };
}

export function useDragAndDrop() {
  const [activeId, setActiveId] = useState<string | number | null>(null);
  const [draggedTab, setDraggedTab] = useState<chrome.tabs.Tab | null>(null);
  const [draggedSavedTab, setDraggedSavedTab] = useState<SavedTab | null>(null);
  const [draggedGroup, setDraggedGroup] = useState<SavedGroup | null>(null);

  const handleDragStart = async (event: DragStartEvent) => {
    const { active } = event;
    setActiveId(active.id);

    // Dragging an opened browser tab (number ID)
    if (typeof active.id === 'number') {
      try {
        const tab = await chrome.tabs.get(active.id as number);
        setDraggedTab(tab);
      } catch (_) { /* Tab may have been closed */ }
      return;
    }

    // Search across ALL spaces for the dragged item (fresh state)
    const { spaces } = getState();
    for (const space of spaces) {
      for (const project of space.projects) {
        for (const category of project.categories) {
          const group = category.groups.find(g => g.id === active.id);
          if (group) { setDraggedGroup(group); return; }
          for (const g of category.groups) {
            const tab = g.tabs.find(t => t.id === active.id);
            if (tab) { setDraggedSavedTab(tab); return; }
          }
        }
      }
    }
  };

  const collisionDetectionStrategy: CollisionDetection = (args) => {
    const isDropTarget = (id: string) =>
      id.startsWith('droppable-') || id.startsWith('cat-drop:') || id.startsWith('proj-drop:') || id.startsWith('space-drop:');

    if (typeof activeId === 'number') {
      const droppableCollisions = rectIntersection({
        ...args,
        droppableContainers: args.droppableContainers.filter((c) => isDropTarget(c.id.toString())),
      });
      if (droppableCollisions.length > 0) return droppableCollisions;
      return pointerWithin(args);
    }

    const allCollisions = pointerWithin(args);
    const droppableCollisions = rectIntersection({
      ...args,
      droppableContainers: args.droppableContainers.filter((c) => isDropTarget(c.id.toString())),
    });
    return [...allCollisions, ...droppableCollisions];
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    const wasDraggingGroup = !!draggedGroup;

    setActiveId(null);
    setDraggedTab(null);
    setDraggedSavedTab(null);
    setDraggedGroup(null);

    if (!over) return;

    // Read fresh state
    const { spaces, currentSpace, currentProject, currentCategory } = getState();
    const {
      addSavedTab, reorderGroups, reorderTabsInGroup, moveTabBetweenGroups,
      moveGroupToCategory, moveTabCrossBoundary,
    } = useSavedSpacesStore.getState();

    const overId = over.id.toString();

    // --- Parse cross-boundary drop targets ---
    const catDropMatch = overId.match(/^cat-drop:(.+):(.+):(.+)$/);
    const projDropMatch = overId.match(/^proj-drop:(.+):(.+)$/);
    const spaceDropMatch = overId.match(/^space-drop:(.+)$/);

    // === DROP ON CATEGORY / PROJECT / SPACE (cross-boundary) ===
    if (catDropMatch || projDropMatch || spaceDropMatch) {
      let tgtSpaceId: string;
      let hintProjectId: string | undefined;
      let hintCategoryId: string | undefined;

      if (catDropMatch) {
        tgtSpaceId = catDropMatch[1];
        hintProjectId = catDropMatch[2];
        hintCategoryId = catDropMatch[3];
      } else if (projDropMatch) {
        tgtSpaceId = projDropMatch[1];
        hintProjectId = projDropMatch[2];
      } else {
        tgtSpaceId = spaceDropMatch![1];
      }

      // Auto-create missing project/category/group as needed
      const target = ensureDropTarget(tgtSpaceId, hintProjectId, hintCategoryId);
      if (!target) return;

      // Re-read fresh state after ensureDropTarget may have created nodes
      const freshStore = useSavedSpacesStore.getState();
      const freshSpaces = freshStore.savedSpaces;

      // Dragging a group
      if (wasDraggingGroup && typeof active.id === 'string') {
        const src = findGroupLocation(freshSpaces, active.id as string);
        if (!src || src.categoryId === target.categoryId) return;
        freshStore.moveGroupToCategory(src.spaceId, src.projectId, src.categoryId, active.id as string, tgtSpaceId, target.projectId, target.categoryId);
        return;
      }

      // Dragging a saved tab
      if (typeof active.id === 'string' && !wasDraggingGroup) {
        const src = findTabLocation(freshSpaces, active.id as string);
        if (!src || src.groupId === target.groupId) return;
        freshStore.moveTabCrossBoundary(src.spaceId, src.projectId, src.categoryId, src.groupId, active.id as string, tgtSpaceId, target.projectId, target.categoryId, target.groupId);
        return;
      }

      // Dragging an opened browser tab
      if (typeof active.id === 'number') {
        try {
          const tab = await chrome.tabs.get(active.id as number);
          const favicon = await faviconToDataUrl(tab.favIconUrl || '');
          const freshCategory = useSavedSpacesStore.getState().savedSpaces
            .find(s => s.id === tgtSpaceId)?.projects.find(p => p.id === target.projectId)
            ?.categories.find(c => c.id === target.categoryId);
          const tgtGroup = freshCategory?.groups.find(g => g.id === target.groupId);
          const savedTab: SavedTab = {
            id: uuidv7(), url: tab.url || '', title: tab.title || 'Untitled',
            favicon, order: tgtGroup?.tabs.length ?? 0,
          };
          freshStore.addSavedTab(tgtSpaceId, target.projectId, target.categoryId, target.groupId, savedTab);
        } catch (_) { /* Tab closed */ }
        return;
      }
      return;
    }

    // === EXISTING LOGIC: drops within current category ===
    if (!currentCategory || !currentSpace || !currentProject) return;

    const spaceId = currentSpace.id;
    const projectId = currentProject.id;
    const categoryId = currentCategory.id;

    // --- Group reordering (within same category) ---
    if (typeof active.id === 'string' && typeof over.id === 'string') {
      const activeGroup = currentCategory.groups.find(g => g.id === active.id);
      const overGroup = currentCategory.groups.find(g => g.id === over.id);

      if (activeGroup && overGroup && active.id !== over.id) {
        const sortedGroups = [...currentCategory.groups].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        const fromIndex = sortedGroups.findIndex(g => g.id === active.id);
        const toIndex = sortedGroups.findIndex(g => g.id === over.id);
        if (fromIndex !== -1 && toIndex !== -1) {
          reorderGroups(spaceId, projectId, categoryId, fromIndex, toIndex);
        }
        return;
      }

      // Group from another category dropped onto a group in current category
      if (wasDraggingGroup && !activeGroup && overGroup) {
        const src = findGroupLocation(spaces, active.id as string);
        if (src) {
          moveGroupToCategory(src.spaceId, src.projectId, src.categoryId, active.id as string, spaceId, projectId, categoryId);
        }
        return;
      }
    }

    // --- Drop opened tab onto group droppable ---
    if (typeof active.id === 'number' && overId.startsWith('droppable-')) {
      const groupId = overId.replace('droppable-', '');
      try {
        const tab = await chrome.tabs.get(active.id as number);
        const targetGroup = currentCategory.groups.find(g => g.id === groupId);
        const nextOrder = targetGroup ? targetGroup.tabs.length : 0;
        const favicon = await faviconToDataUrl(tab.favIconUrl || '');
        const savedTab: SavedTab = {
          id: uuidv7(), url: tab.url || '', title: tab.title || 'Untitled',
          favicon, order: nextOrder,
        };
        addSavedTab(spaceId, projectId, categoryId, groupId, savedTab);
      } catch (_) { /* Tab closed */ }
      return;
    }

    // --- Saved tab operations ---
    if (typeof active.id !== 'string') return;

    // Find source — search all spaces (fresh state)
    const src = findTabLocation(spaces, active.id as string);
    if (!src) return;

    const srcSpace = spaces.find(s => s.id === src.spaceId);
    const srcProject = srcSpace?.projects.find(p => p.id === src.projectId);
    const srcCategory = srcProject?.categories.find(c => c.id === src.categoryId);
    const srcGroup = srcCategory?.groups.find(g => g.id === src.groupId);
    const draggedTabRef = srcGroup?.tabs.find(t => t.id === active.id) ?? null;
    if (!draggedTabRef) return;

    // Case 1: Drop on another saved tab (reorder or cross-group move)
    if (typeof over.id === 'string' && !overId.startsWith('droppable-')) {
      const tgt = findTabLocation(spaces, over.id as string);
      if (!tgt) return;

      if (src.groupId === tgt.groupId) {
        // Same group reorder
        const sortedTabs = [...srcGroup!.tabs].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        const fromIndex = sortedTabs.findIndex(tab => tab.id === active.id);
        const toIndex = sortedTabs.findIndex(tab => tab.id === over.id);
        if (fromIndex !== -1 && toIndex !== -1) {
          reorderTabsInGroup(src.spaceId, src.projectId, src.categoryId, src.groupId, fromIndex, toIndex);
        }
      } else if (src.spaceId === tgt.spaceId && src.projectId === tgt.projectId && src.categoryId === tgt.categoryId) {
        // Same category, different group
        const targetGroup = srcCategory!.groups.find(g => g.id === tgt.groupId);
        if (!targetGroup) return;
        const sortedTargetTabs = [...targetGroup.tabs].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        const insertIndex = sortedTargetTabs.findIndex(tab => tab.id === over.id);
        moveTabBetweenGroups(src.spaceId, src.projectId, src.categoryId, src.groupId, tgt.groupId, draggedTabRef.id, insertIndex);
      } else {
        // Cross-boundary tab move
        const tgtSpace = spaces.find(s => s.id === tgt.spaceId);
        const tgtProject = tgtSpace?.projects.find(p => p.id === tgt.projectId);
        const tgtCategory = tgtProject?.categories.find(c => c.id === tgt.categoryId);
        const targetGroup = tgtCategory?.groups.find(g => g.id === tgt.groupId);
        if (!targetGroup) return;
        const sortedTargetTabs = [...targetGroup.tabs].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        const insertIndex = sortedTargetTabs.findIndex(tab => tab.id === over.id);
        moveTabCrossBoundary(src.spaceId, src.projectId, src.categoryId, src.groupId, draggedTabRef.id, tgt.spaceId, tgt.projectId, tgt.categoryId, tgt.groupId, insertIndex);
      }
    }
    // Case 2: Drop on group droppable zone (append to end)
    else if (overId.startsWith('droppable-')) {
      const targetGroupId = overId.replace('droppable-', '');
      if (src.groupId === targetGroupId) return;

      if (currentCategory?.groups.find(g => g.id === targetGroupId)) {
        if (src.categoryId === categoryId) {
          moveTabBetweenGroups(spaceId, projectId, categoryId, src.groupId, targetGroupId, draggedTabRef.id);
        } else {
          moveTabCrossBoundary(src.spaceId, src.projectId, src.categoryId, src.groupId, draggedTabRef.id, spaceId, projectId, categoryId, targetGroupId);
        }
      }
    }
  };

  return {
    handleDragStart,
    handleDragEnd,
    collisionDetectionStrategy,
    activeId,
    draggedTab,
    draggedSavedTab,
    draggedGroup
  };
}
