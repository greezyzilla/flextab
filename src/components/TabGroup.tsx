import { SortableContext, useSortable } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { DragHandleIcon } from "./icons/DragHandleIcon";
import { FaviconImg } from "./FaviconImg";
import { CSS } from "@dnd-kit/utilities";
import type { SavedGroup, SavedTab } from "~src/types";
import { useSavedSpacesStore, useActiveSpace, useActiveProject, useActiveCategory } from "~src/store/useSavedSpacesStore";
import { showUndoToast } from "./UndoToast";

function SavedTabItem({ tab, groupId }: { tab: SavedTab; groupId: string }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tab.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const { removeSavedTab, addSavedTab } = useSavedSpacesStore();
  const activeSpace = useActiveSpace();
  const activeProject = useActiveProject();
  const activeCategory = useActiveCategory();

  const onClick = () => {
    chrome.tabs.create({ url: tab.url });
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeSpace || !activeProject || !activeCategory) return;
    removeSavedTab(activeSpace.id, activeProject.id, activeCategory.id, groupId, tab);
    showUndoToast(`Removed "${tab.title}"`, () => {
      addSavedTab(activeSpace.id, activeProject.id, activeCategory.id, groupId, tab);
    });
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 py-2 px-3 bg-white/5 rounded-md hover:bg-white/10 transition-colors group"
    >
      <div
        {...attributes}
        {...listeners}
        className={`${isDragging ? 'opacity-100' : 'opacity-40 group-hover:opacity-50 hover:!opacity-100'} cursor-grab active:cursor-grabbing p-1 rounded transition-opacity`}
        title="Drag to reorder"
      >
        <DragHandleIcon />
      </div>

      <div
        className="flex items-center gap-3 flex-1 cursor-pointer overflow-hidden"
        onClick={onClick}
      >
        <FaviconImg src={tab.favicon} alt={tab.title} />
        <div className="flex flex-col gap-0.5 text-white/90 overflow-hidden">
          <div className="text-xs truncate">{tab.title}</div>
          <div className="text-white/50 text-xs truncate flex-1">{tab.url}</div>
        </div>
      </div>

      <button
        onClick={handleDelete}
        className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-400 transition-all text-xs shrink-0"
        title="Remove tab"
      >
        ✕
      </button>
    </div>
  )
}

export interface TabGroupProps {
  group: SavedGroup;
}

export function TabGroup({ group }: TabGroupProps) {
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: `droppable-${group.id}`,
  });
  const { removeSavedGroup, addSavedGroup } = useSavedSpacesStore();
  const activeSpace = useActiveSpace();
  const activeProject = useActiveProject();
  const activeCategory = useActiveCategory();

  // Sort tabs by order field to maintain consistent ordering
  const sortedTabs = [...(group.tabs || [])].sort((a, b) => {
    const orderA = a.order ?? 0;
    const orderB = b.order ?? 0;
    return orderA - orderB;
  });

  const handleOpenAll = () => {
    const urls = sortedTabs.map(t => t.url).filter(Boolean);
    if (urls.length === 0) return;
    chrome.windows.create({ url: urls });
  };

  const handleDeleteGroup = () => {
    if (!activeSpace || !activeProject || !activeCategory) return;
    removeSavedGroup(activeSpace.id, activeProject.id, activeCategory.id, group);
    showUndoToast(`Deleted group "${group.name}"`, () => {
      addSavedGroup(activeSpace.id, activeProject.id, activeCategory.id, group);
    });
  };

  return (
    <div className="flex flex-col gap-2 p-4">
      <div className="flex items-center justify-between pl-6 pr-1 group/header">
        <h3 className="text-white/60 font-sans text-sm">{group.name}</h3>
        <div className="flex items-center gap-2">
          {sortedTabs.length > 0 && (
            <button
              onClick={handleOpenAll}
              className="text-white/40 hover:text-white/70 font-sans text-xs transition-colors"
              title="Open all tabs in new window"
            >
              Open All
            </button>
          )}
          <button
            onClick={handleDeleteGroup}
            className="opacity-0 group-hover/header:opacity-100 text-white/30 hover:text-red-400 font-sans text-xs transition-all"
            title="Delete group"
          >
            ✕
          </button>
        </div>
      </div>
      {sortedTabs.length > 0 ? (
        <SortableContext items={sortedTabs.map((tab) => tab.id)}>
          <div
            className={`grid grid-cols-4 gap-2 border border-black-800 rounded-md p-2 transition-colors relative ${isOver ? 'border-blue-500 bg-blue-500/10' : ''}`}
            ref={setDroppableRef}
          >
            {/* Invisible overlay to catch drops when dragging over saved tabs */}
            {isOver && (
              <div className="absolute inset-0 z-10 pointer-events-none bg-blue-500/5 rounded-md" />
            )}
            {
              sortedTabs.map((tab) => (
                <SavedTabItem key={tab.id} tab={tab} groupId={group.id} />
              ))
            }
          </div>
        </SortableContext>
      ) : (
        <div
          className={`text-white/50 font-sans text-sm p-12 text-center border border-black-800 rounded-md border-dashed transition-colors ${isOver ? 'border-blue-500 bg-blue-500/10 text-blue-400' : ''}`}
          ref={setDroppableRef}
        >
          {isOver ? 'Drop tab here' : 'No saved tabs yet'}
        </div>
      )}
    </div>
  )
}