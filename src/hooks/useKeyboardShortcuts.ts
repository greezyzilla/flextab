import { useEffect } from "react";
import { v7 as uuidv7 } from "uuid";
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore";
import type { SavedTab } from "~src/types";
import { faviconToDataUrl } from "~src/utils/favicon";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (target.isContentEditable) return true;
  return false;
}

export function useKeyboardShortcuts() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip if user is typing in an input / textarea / contenteditable
      if (isEditableTarget(e.target)) return;

      const mod = e.metaKey || e.ctrlKey;

      // Delete / Backspace when nothing focused — no-op for safety
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        return;
      }

      // Ctrl+Shift+N / Cmd+Shift+N — create new project in active space
      // (must be checked BEFORE Ctrl+N to avoid shadowing)
      if (mod && e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        const state = useSavedSpacesStore.getState();
        const { activeSpaceId, savedSpaces } = state;
        if (!activeSpaceId) return;

        const space = savedSpaces.find(s => s.id === activeSpaceId);
        if (!space) return;

        state.addSavedProject(activeSpaceId, {
          id: uuidv7(),
          name: "New Project",
          categories: [],
          order: space.projects.length,
        });
        return;
      }

      // Ctrl+N / Cmd+N — create new group in active category
      if (mod && !e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        const state = useSavedSpacesStore.getState();
        const { activeSpaceId, activeProjectId, activeCategoryId, savedSpaces } = state;
        if (!activeSpaceId || !activeProjectId || !activeCategoryId) return;

        const space = savedSpaces.find(s => s.id === activeSpaceId);
        const project = space?.projects.find(p => p.id === activeProjectId);
        const category = project?.categories.find(c => c.id === activeCategoryId);
        if (!category) return;

        state.addSavedGroup(activeSpaceId, activeProjectId, activeCategoryId, {
          id: uuidv7(),
          name: "New Group",
          tabs: [],
          order: category.groups.length,
        });
        return;
      }

      // Ctrl+Shift+S / Cmd+Shift+S — save all open tabs
      if (mod && e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        const state = useSavedSpacesStore.getState();
        const { activeSpaceId, activeProjectId, activeCategoryId, savedSpaces } = state;
        if (!activeSpaceId || !activeProjectId || !activeCategoryId) return;

        const space = savedSpaces.find(s => s.id === activeSpaceId);
        const project = space?.projects.find(p => p.id === activeProjectId);
        const category = project?.categories.find(c => c.id === activeCategoryId);
        if (!category) return;

        // Async — fire and forget
        (async () => {
          const windows = await chrome.windows.getAll({ populate: true });
          const allTabs = windows
            .flatMap(w => w.tabs ?? [])
            .filter(t => t.url && !t.url.startsWith("chrome://"));
          if (allTabs.length === 0) return;

          const groupId = uuidv7();
          const groupName = `Saved ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

          state.addSavedGroup(activeSpaceId, activeProjectId, activeCategoryId, {
            id: groupId,
            name: groupName,
            tabs: [],
            order: category.groups.length,
          });

          const savedTabs: SavedTab[] = await Promise.all(
            allTabs.map(async (tab, i) => ({
              id: uuidv7(),
              url: tab.url || "",
              title: tab.title || "Untitled",
              favicon: await faviconToDataUrl(tab.favIconUrl || ""),
              order: i,
            })),
          );

          state.addSavedTabsBatch(activeSpaceId, activeProjectId, activeCategoryId, groupId, savedTabs);
        })();
        return;
      }

    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);
}
