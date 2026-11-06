import { useEffect } from "react";
import { v7 as uuidv7 } from "uuid";
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore";
import { saveTabsAsGroup, defaultSavedGroupName, type SaveTabsTarget } from "~src/services/saveTabsAsGroup";
import { NEW_GROUP_NAME } from "~src/services/resolveSaveTarget";
import { requestMissingLevel } from "~src/lib/structurePrompts";
import { useUIStore } from "~src/store/useUIStore";

/**
 * Run `action` against the current category, following the same destination
 * policy as every other save path (TASK-1): a missing project/category is
 * asked for inline (never invented), then the shortcut finishes on its own.
 */
export function withActiveCategory(action: (target: SaveTabsTarget) => void): void {
  const state = useSavedSpacesStore.getState();
  const space = state.savedSpaces.find(s => s.id === state.activeSpaceId);
  if (!space) return;
  const project = space.projects.find(p => p.id === state.activeProjectId) ?? space.projects[0];
  if (!project) {
    requestMissingLevel({ missing: "project", spaceId: space.id }, () => withActiveCategory(action));
    return;
  }
  const category = project.categories.find(c => c.id === state.activeCategoryId) ?? project.categories[0];
  if (!category) {
    requestMissingLevel({ missing: "category", spaceId: space.id, projectId: project.id }, () => withActiveCategory(action));
    return;
  }
  action({ spaceId: space.id, projectId: project.id, categoryId: category.id });
}

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

      // Ctrl+Shift+N / Cmd+Shift+N — new project in the active space, named
      // first like every other way of creating one (no "New Project" node).
      // (must be checked BEFORE Ctrl+N to avoid shadowing)
      if (mod && e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        const { activeSpaceId, savedSpaces } = useSavedSpacesStore.getState();
        if (!activeSpaceId || !savedSpaces.some(s => s.id === activeSpaceId)) return;
        useUIStore.getState().startCreate({ kind: "project", spaceId: activeSpaceId });
        return;
      }

      // Ctrl+N / Cmd+N — create new group in the current category
      if (mod && !e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        withActiveCategory(({ spaceId, projectId, categoryId }) => {
          const state = useSavedSpacesStore.getState();
          const category = state.savedSpaces.find(s => s.id === spaceId)
            ?.projects.find(p => p.id === projectId)
            ?.categories.find(c => c.id === categoryId);
          state.addSavedGroup(spaceId, projectId, categoryId, {
            id: uuidv7(),
            name: NEW_GROUP_NAME,
            tabs: [],
            order: category?.groups.length ?? 0,
          });
        });
        return;
      }

      // Ctrl+Shift+S / Cmd+Shift+S — save all open tabs into the current category
      if (mod && e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        withActiveCategory(target => {
          // Async — fire and forget
          void (async () => {
            const windows = await chrome.windows.getAll({ populate: true });
            const allTabs = windows.flatMap((w) => w.tabs ?? []);
            await saveTabsAsGroup({ target, name: defaultSavedGroupName(), tabs: allTabs });
          })();
        });
        return;
      }

    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);
}
