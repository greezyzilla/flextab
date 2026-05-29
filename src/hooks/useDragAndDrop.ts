import { useState } from "react";
import { type DragStartEvent, type DragEndEvent, rectIntersection, pointerWithin } from "@dnd-kit/core";
import { v7 as uuidv7 } from "uuid";
import type { SavedTab, SavedGroup } from "~src/types";
import { useSavedSpacesStore, useActiveSpace, useActiveProject, useActiveCategory } from "~src/store/useSavedSpacesStore";
import { faviconToDataUrl } from "~src/utils/favicon";

export function useDragAndDrop() {
  const {
    addSavedTab, reorderGroups, reorderTabsInGroup, moveTabBetweenGroups
  } = useSavedSpacesStore();

  const [activeId, setActiveId] = useState<string | number | null>(null);
  const [draggedTab, setDraggedTab] = useState<chrome.tabs.Tab | null>(null);
  const [draggedSavedTab, setDraggedSavedTab] = useState<SavedTab | null>(null);
  const [draggedGroup, setDraggedGroup] = useState<SavedGroup | null>(null);

  const currentSpace = useActiveSpace();
  const currentProject = useActiveProject();
  const currentCategory = useActiveCategory();

  const handleDragStart = async (event: DragStartEvent) => {
    const { active } = event;
    setActiveId(active.id);

    if (!currentCategory) return;

    // Check if dragging a group
    if (typeof active.id === 'string') {
      const group = currentCategory.groups.find(g => g.id === active.id);
      if (group) {
        setDraggedGroup(group);
        return;
      }

      // Check if dragging a saved tab
      for (const group of currentCategory.groups) {
        const foundTab = group.tabs.find(tab => tab.id === active.id);
        if (foundTab) {
          setDraggedSavedTab(foundTab);
          break;
        }
      }
    } else {
      // Dragging an opened tab (number ID)
      try {
        const tab = await chrome.tabs.get(active.id as number);
        setDraggedTab(tab);
      } catch {
        // Tab may have been closed
      }
    }
  };

  const collisionDetectionStrategy = (args: any) => {
    if (typeof activeId === 'number') {
      // For opened tabs, prioritize droppable areas
      const droppableCollisions = rectIntersection({
        ...args,
        droppableContainers: args.droppableContainers.filter((container: any) =>
          container.id.toString().startsWith('droppable-')
        ),
      });
      if (droppableCollisions.length > 0) return droppableCollisions;
      return pointerWithin(args);
    }

    // For saved tabs, combine pointer and droppable collisions
    const allCollisions = pointerWithin(args);
    const droppableCollisions = rectIntersection({
      ...args,
      droppableContainers: args.droppableContainers.filter((container: any) =>
        container.id.toString().startsWith('droppable-')
      ),
    });
    return [...allCollisions, ...droppableCollisions];
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    setActiveId(null);
    setDraggedTab(null);
    setDraggedSavedTab(null);
    setDraggedGroup(null);

    if (!over || !currentCategory || !currentSpace || !currentProject) return;

    const spaceId = currentSpace.id;
    const projectId = currentProject.id;
    const categoryId = currentCategory.id;

    // --- Group reordering ---
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
    }

    // --- Drop opened tab onto group ---
    if (typeof active.id === 'number' && over.id.toString().startsWith('droppable-')) {
      const groupId = over.id.toString().replace('droppable-', '');

      try {
        const tab = await chrome.tabs.get(active.id as number);
        const targetGroup = currentCategory.groups.find(g => g.id === groupId);
        const nextOrder = targetGroup ? targetGroup.tabs.length : 0;
        const favicon = await faviconToDataUrl(tab.favIconUrl || '');

        const savedTab: SavedTab = {
          id: uuidv7(),
          url: tab.url || '',
          title: tab.title || 'Untitled',
          favicon,
          description: tab.url || '',
          order: nextOrder
        };

        addSavedTab(spaceId, projectId, categoryId, groupId, savedTab);
      } catch {
        // Tab may have been closed during drag
      }
      return;
    }

    // --- Saved tab operations ---
    if (typeof active.id !== 'string') return;

    // Find source group and tab
    let sourceGroup: SavedGroup | null = null;
    let draggedTabRef: SavedTab | null = null;

    for (const group of currentCategory.groups) {
      const foundTab = group.tabs.find(tab => tab.id === active.id);
      if (foundTab) {
        sourceGroup = group;
        draggedTabRef = foundTab;
        break;
      }
    }

    if (!sourceGroup || !draggedTabRef) return;

    // Case 1: Drop on another saved tab (reorder or cross-group move)
    if (typeof over.id === 'string' && !over.id.toString().startsWith('droppable-')) {
      let targetGroup: SavedGroup | null = null;

      for (const group of currentCategory.groups) {
        if (group.tabs.find(tab => tab.id === over.id)) {
          targetGroup = group;
          break;
        }
      }

      if (!targetGroup) return;

      if (sourceGroup.id === targetGroup.id) {
        // Same group reorder
        const fromIndex = sourceGroup.tabs.findIndex(tab => tab.id === active.id);
        const toIndex = sourceGroup.tabs.findIndex(tab => tab.id === over.id);
        if (fromIndex !== -1 && toIndex !== -1) {
          reorderTabsInGroup(spaceId, projectId, categoryId, sourceGroup.id, fromIndex, toIndex);
        }
      } else {
        // Cross-group move: insert at target tab position
        const sortedTargetTabs = [...targetGroup.tabs].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        const insertIndex = sortedTargetTabs.findIndex(tab => tab.id === over.id);
        moveTabBetweenGroups(spaceId, projectId, categoryId, sourceGroup.id, targetGroup.id, draggedTabRef.id, insertIndex);
      }
    }
    // Case 2: Drop on group droppable zone (append to end)
    else if (over.id.toString().startsWith('droppable-')) {
      const targetGroupId = over.id.toString().replace('droppable-', '');
      if (sourceGroup.id !== targetGroupId) {
        moveTabBetweenGroups(spaceId, projectId, categoryId, sourceGroup.id, targetGroupId, draggedTabRef.id);
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
