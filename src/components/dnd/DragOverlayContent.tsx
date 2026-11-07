import { useDndContext } from "@dnd-kit/core";
import { DraggedTabGroup } from "./DraggedTabGroup";
import type { GroupColor, SavedGroup, SavedSpace, SavedTab } from "~src/types";
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore";
import { resolveOverGroupId } from "~src/services/dragDrop";
import { groupColorFill, groupTintSurface } from "~src/lib/groupColors";
import { DragHandleIcon } from "../icons/DragHandleIcon";
import { FaviconImg } from "../FaviconImg";

interface DragOverlayContentProps {
  activeId: string | number | null;
  draggedGroup: SavedGroup | null;
  draggedTab: chrome.tabs.Tab | null;
  draggedSavedTab: SavedTab | null;
}

function groupColorOf(spaces: SavedSpace[], groupId: string | null): GroupColor | undefined {
  if (!groupId) return undefined;
  for (const s of spaces) for (const p of s.projects) for (const c of p.categories)
    for (const g of c.groups) if (g.id === groupId) return g.color;
  return undefined;
}

export function DragOverlayContent({ activeId, draggedGroup, draggedTab, draggedSavedTab }: DragOverlayContentProps) {
  // A dragged tab takes the colour of the group it is over (TASK-18), as a tab
  // dragged into a Chrome tab group takes that group's colour: the card shows
  // where it will land. Over an uncoloured group it stays neutral + accent.
  const { over } = useDndContext();
  const spaces = useSavedSpacesStore((s) => s.savedSpaces);
  const overColor = draggedGroup || !over ? undefined : groupColorOf(spaces, resolveOverGroupId(spaces, String(over.id)));

  if (activeId && draggedGroup) {
    return <DraggedTabGroup group={draggedGroup} />;
  }

  if (activeId && (draggedTab || draggedSavedTab)) {
    return (
      <div
        className={`flex gap-3 items-center w-full rounded-md px-3 py-2 text-left shadow-lg border transition-colors ${overColor ? '' : 'bg-black-800 hover:bg-black-700 border-[var(--accent)]'}`}
        style={overColor ? { borderColor: groupColorFill(overColor), backgroundColor: groupTintSurface(overColor, { base: 'var(--color-black-800)', strength: 2 }) } : undefined}
      >
        <div className="opacity-100 cursor-grabbing p-1 rounded">
          <DragHandleIcon />
        </div>

        {draggedTab && (
          <>
            <FaviconImg src={draggedTab.favIconUrl} alt={draggedTab.title} />
            <div className="flex flex-col text-fg truncate">
              <div>{draggedTab.title}</div>
              <div className="truncate">{draggedTab.url}</div>
            </div>
          </>
        )}

        {draggedSavedTab && (
          <>
            <FaviconImg src={draggedSavedTab.favicon} alt={draggedSavedTab.title} />
            <div className="flex flex-col text-fg truncate">
              <div>{draggedSavedTab.title}</div>
              <div className="truncate">{draggedSavedTab.url}</div>
            </div>
          </>
        )}
      </div>
    );
  }

  return null;
}
