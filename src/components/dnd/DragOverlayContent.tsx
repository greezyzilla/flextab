import { useDndContext } from "@dnd-kit/core";
import { Icon } from "~src/components/ui/icon"
import { GripVertical } from "lucide-react"
import { DraggedTabGroup } from "./DraggedTabGroup";
import type { GroupColor, SavedGroup, SavedSpace, SavedTab } from "~src/types";
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore";
import { useSortPreview } from "~src/store/useSortPreview";
import { resolveOverGroupId } from "~src/services/dragDrop";
import { groupColorFill, groupTintSurface } from "~src/lib/groupColors";
import { FaviconImg } from "../FaviconImg";
import { CategoryIcon, ProjectIcon, spaceAvatarColors } from "../levelIcons";

interface DragOverlayContentProps {
  activeId: string | number | null;
  draggedGroup: SavedGroup | null;
  draggedTab: chrome.tabs.Tab | null;
  draggedSavedTab: SavedTab | null;
  /** A dragged space, project or category (TASK-59, TASK-66): its kind and name. */
  draggedContainer?: { kind: "space" | "project" | "category"; spaceId?: string; name: string } | null;
}

function groupColorOf(spaces: SavedSpace[], groupId: string | null): GroupColor | undefined {
  if (!groupId) return undefined;
  for (const s of spaces) for (const p of s.projects) for (const c of p.categories)
    for (const g of c.groups) if (g.id === groupId) return g.color;
  return undefined;
}

export function DragOverlayContent({ activeId, draggedGroup, draggedTab, draggedSavedTab, draggedContainer }: DragOverlayContentProps) {
  // A dragged tab takes the colour of the group it is over (TASK-18), as a tab
  // dragged into a Chrome tab group takes that group's colour: the card shows
  // where it will land. Over an uncoloured group it stays neutral + accent.
  const { over } = useDndContext();
  const spaces = useSavedSpacesStore((s) => s.savedSpaces);
  // Shown in another group already (TASK-64): over its own slot there, the tint follows that group.
  const preview = useSortPreview((s) => s.preview);
  const overGroupId = preview?.kind === "tab" ? preview.to : over ? resolveOverGroupId(spaces, String(over.id)) : null;
  const overColor = draggedGroup || !over ? undefined : groupColorOf(spaces, overGroupId);

  // A project or category travels as its sidebar row: icon and name, on the
  // same card a dragged tab uses, sized to the sidebar it is dragged from. It
  // rides below-right of the pointer (the overlay starts at the small icon
  // handle), so the rail space or row under the pointer stays visible with
  // its drop highlight.
  // A rail space (TASK-66) travels as a copy of its own avatar, at its size,
  // lifted with a shadow, as dragged items look in the UI references. The
  // avatar's fill is translucent, so the copy sits on the page colour.
  if (activeId && draggedContainer?.kind === "space") {
    const space = spaces.find((s) => s.id === draggedContainer.spaceId);
    const active = useSavedSpacesStore.getState().activeSpaceId === draggedContainer.spaceId;
    return (
      <div data-dragged-space={draggedContainer.spaceId} className="h-10 w-10 rounded-full bg-black-900 shadow-lg cursor-grabbing">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-full font-sans text-xs font-normal ${active ? "ring-2 ring-ink/50" : ""}`}
          style={spaceAvatarColors(space, active)}
        >
          {(space?.abbreviation || (space?.name ?? draggedContainer.name).slice(0, 2)).toUpperCase()}
        </div>
      </div>
    );
  }

  if (activeId && draggedContainer) {
    const Icon = draggedContainer.kind === "project" ? ProjectIcon : CategoryIcon;
    return (
      <div className="flex w-56 translate-x-9 translate-y-3.5 items-center gap-2 rounded-md border border-[var(--accent)] bg-black-800 px-3 py-2 text-fg shadow-lg cursor-grabbing">
        <Icon className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
        <span className={`truncate font-sans text-[13px] ${draggedContainer.kind === "project" ? "font-medium" : ""}`}>{draggedContainer.name}</span>
      </div>
    );
  }

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
          <Icon icon={GripVertical} size="xs" className="text-fg-subtle" />
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
