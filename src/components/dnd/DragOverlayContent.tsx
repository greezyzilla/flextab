import { DraggedTabGroup } from "./DraggedTabGroup";
import type { SavedGroup, SavedTab } from "~src/types";
import { DragHandleIcon } from "../icons/DragHandleIcon";
import { FaviconImg } from "../FaviconImg";

interface DragOverlayContentProps {
  activeId: string | number | null;
  draggedGroup: SavedGroup | null;
  draggedTab: chrome.tabs.Tab | null;
  draggedSavedTab: SavedTab | null;
}

export function DragOverlayContent({ activeId, draggedGroup, draggedTab, draggedSavedTab }: DragOverlayContentProps) {
  if (activeId && draggedGroup) {
    return <DraggedTabGroup group={draggedGroup} />;
  }

  if (activeId && (draggedTab || draggedSavedTab)) {
    return (
      <div className="flex gap-3 items-center w-full rounded-md bg-black-800 hover:bg-black-700 px-3 py-2 text-left shadow-lg border border-[var(--accent)]">
        <div className="opacity-100 cursor-grabbing p-1 rounded">
          <DragHandleIcon />
        </div>

        {draggedTab && (
          <>
            <FaviconImg src={draggedTab.favIconUrl} alt={draggedTab.title} />
            <div className="flex flex-col text-white/90 truncate">
              <div>{draggedTab.title}</div>
              <div className="truncate">{draggedTab.url}</div>
            </div>
          </>
        )}

        {draggedSavedTab && (
          <>
            <FaviconImg src={draggedSavedTab.favicon} alt={draggedSavedTab.title} />
            <div className="flex flex-col text-white/90 truncate">
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
