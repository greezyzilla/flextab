import { useActiveCategory, useActiveGroups, useActiveSpace, useActiveProject, useSavedSpacesStore } from "~src/store/useSavedSpacesStore";
import type { SavedGroup, SavedTab } from "~src/types";
import { TabGroup } from "../TabGroup";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DragHandleIcon } from "../icons/DragHandleIcon";
import { ChevronDownIcon } from "../icons/ChevronDownIcon";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef, useCallback } from "react";
import { v7 as uuidv7 } from "uuid";
import { faviconToDataUrl } from "~src/utils/favicon";

function SortableGroup({ group }: { group: SavedGroup }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: group.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative">
      <div className="absolute top-4 left-4 z-10 opacity-30 hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing" {...attributes} {...listeners}>
        <DragHandleIcon className="w-4 h-4 text-white/50" />
      </div>
      <TabGroup group={group} />
    </div>
  );
}

export function ContentPanel() {
  const activeSpace = useActiveSpace();
  const activeProject = useActiveProject();
  const activeCategory = useActiveCategory();
  const currentGroups = useActiveGroups();
  const { addSavedGroup, addSavedTab } = useSavedSpacesStore();
  const parentRef = useRef<HTMLDivElement>(null);

  const handleSaveAllTabs = useCallback(async () => {
    if (!activeSpace || !activeProject || !activeCategory) return;

    const windows = await chrome.windows.getAll({ populate: true });
    const allTabs = windows.flatMap(w => w.tabs ?? []).filter(t => t.url && !t.url.startsWith('chrome://'));

    if (allTabs.length === 0) return;

    const groupId = uuidv7();
    const groupName = `Saved ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

    addSavedGroup(activeSpace.id, activeProject.id, activeCategory.id, {
      id: groupId,
      name: groupName,
      tabs: [],
      order: currentGroups.length,
    });

    const savedTabs: SavedTab[] = await Promise.all(
      allTabs.map(async (tab, i) => ({
        id: uuidv7(),
        url: tab.url || '',
        title: tab.title || 'Untitled',
        favicon: await faviconToDataUrl(tab.favIconUrl || ''),
        order: i,
      })),
    );

    for (const tab of savedTabs) {
      addSavedTab(activeSpace.id, activeProject.id, activeCategory.id, groupId, tab);
    }
  }, [activeSpace, activeProject, activeCategory, currentGroups.length, addSavedGroup, addSavedTab]);

  const sortedGroups = [...currentGroups].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const rowVirtualizer = useVirtualizer({
    count: sortedGroups.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 150,
    overscan: 2,
  });

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <div className="flex justify-between gap-2 p-4 border-b border-black-800 shrink-0">
        <h2 className="text-white/70 font-sans text-base font-medium">{activeCategory?.name}</h2>
        <div className="flex gap-2 items-center">
          {activeCategory && (
            <button
              onClick={handleSaveAllTabs}
              className="text-white/50 hover:text-white/80 font-sans text-xs px-2 py-1 rounded border border-white/20 hover:border-white/40 transition-colors"
              title="Save all opened tabs as a new group"
            >
              Save All Tabs
            </button>
          )}
          <button className="text-white/70 font-sans text-sm">
            <ChevronDownIcon />
          </button>
        </div>
      </div>

      <div ref={parentRef} className="flex-1 overflow-y-auto p-4 content-panel-scroll">
        {sortedGroups.length > 0 ? (
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            <SortableContext items={sortedGroups.map(g => g.id)} strategy={verticalListSortingStrategy}>
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const group = sortedGroups[virtualRow.index];
                return (
                  <div
                    key={group.id}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    ref={rowVirtualizer.measureElement}
                    data-index={virtualRow.index}
                  >
                    <SortableGroup group={group} />
                  </div>
                );
              })}
            </SortableContext>
          </div>
        ) : (
          <div className="text-white/50 font-sans text-sm p-12 text-center flex items-center justify-center">No saved groups yet</div>
        )}
      </div>
    </div>
  )
}
