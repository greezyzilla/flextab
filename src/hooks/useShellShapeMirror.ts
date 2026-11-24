import { useEffect } from "react";
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore";
import { useSettingsStore } from "~src/store/useSettingsStore";
import { storeShellShape, workspaceShape } from "~src/lib/shellShape";
import { storeShellSkeletonMarkup } from "~src/components/layout/ShellSkeleton";

/**
 * Keeps the loading shell's copy of the workspace shape current (lib/shellShape.ts): after any
 * change to the workspace, the selection or the group layout, written once things settle.
 */
export function useShellShapeMirror() {
  const savedSpaces = useSavedSpacesStore((s) => s.savedSpaces);
  const activeSpaceId = useSavedSpacesStore((s) => s.activeSpaceId);
  const activeProjectId = useSavedSpacesStore((s) => s.activeProjectId);
  const activeCategoryId = useSavedSpacesStore((s) => s.activeCategoryId);
  const expandedProjectIds = useSavedSpacesStore((s) => s.expandedProjectIds);
  const groupLayout = useSettingsStore((s) => s.groupLayout);
  const gridColumns = useSettingsStore((s) => s.gridColumns);

  useEffect(() => {
    const t = setTimeout(() => {
      storeShellShape(workspaceShape({ savedSpaces, activeSpaceId, activeProjectId, activeCategoryId, expandedProjectIds }, groupLayout, gridColumns));
      storeShellSkeletonMarkup();
    }, 300);
    return () => clearTimeout(t);
  }, [savedSpaces, activeSpaceId, activeProjectId, activeCategoryId, expandedProjectIds, groupLayout, gridColumns]);
}
