import { useEffect } from "react";
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore";
import type { SaveTabsTarget } from "~src/services/saveTabsAsGroup";
import { ensureCategoryPath } from "~src/lib/defaultPath";
import { useUIStore } from "~src/store/useUIStore";

/**
 * Run `action` against the current category, following the same rule as
 * every other save path (TASK-20): if the active space has no project or
 * category yet, the default ones are created so the shortcut always works.
 */
export function withActiveCategory(action: (target: SaveTabsTarget) => void): void {
  const state = useSavedSpacesStore.getState();
  if (!state.activeSpaceId) return;
  const path = ensureCategoryPath(state.activeSpaceId, { projectId: state.activeProjectId, categoryId: state.activeCategoryId });
  if (path) action(path);
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
        // Same as "+ New group": name it first, it is created at the top.
        withActiveCategory(({ projectId, categoryId }) => {
          const state = useSavedSpacesStore.getState();
          if (state.activeProjectId !== projectId) state.setActiveProject(projectId);
          state.setActiveCategory(categoryId);
          useUIStore.getState().startNamingGroup(categoryId);
        });
        return;
      }

      // Ctrl+Shift+S / Cmd+Shift+S — "Save all tabs" (preview, scope, destination)
      if (mod && e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        useUIStore.getState().setSaveAllOpen(true);
        return;
      }

    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);
}
