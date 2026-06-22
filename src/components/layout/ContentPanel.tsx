import { useActiveCategory, useActiveGroups, useActiveSpace, useActiveProject, useSavedSpacesStore } from "~src/store/useSavedSpacesStore";
import type { SavedTab, SavedGroup } from "~src/types";
import { TabGroup } from "../TabGroup";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DragHandleIcon } from "../icons/DragHandleIcon";
import { useRef, useCallback } from "react";
import { v7 as uuidv7 } from "uuid";
import { faviconToDataUrl } from "~src/utils/favicon";
import { useSettingsStore, type GroupLayout } from "~src/store/useSettingsStore";

function SortableGroup({ group, layout, gridColumns }: { group: SavedGroup; layout: GroupLayout; gridColumns: number }) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: group.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative group/sortable">
      <div className="absolute top-5 left-5 z-10 opacity-0 group-hover/sortable:opacity-30 hover:!opacity-80 transition-opacity cursor-grab active:cursor-grabbing" {...attributes} {...listeners}>
        <DragHandleIcon className="w-4 h-4 text-white/50" />
      </div>
      <TabGroup group={group} layout={layout} gridColumns={gridColumns} />
    </div>
  );
}

function EmptyState({ onSaveAllTabs, onNewGroup }: { onSaveAllTabs: () => void; onNewGroup: () => void }) {
  return (
    <div className="flex-1 flex items-center justify-center p-12">
      <div className="flex flex-col items-center gap-6 max-w-xs text-center">
        <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
          <svg className="w-8 h-8 text-white/15" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
          </svg>
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="text-white/50 font-sans text-sm font-medium">No saved tabs yet</h3>
          <p className="text-white/25 font-sans text-xs leading-relaxed">
            Create an empty group, drag tabs from the right panel, or save all your open tabs at once.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onNewGroup}
            className="px-5 py-2.5 text-white text-xs font-sans rounded-lg transition-colors"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            New Group
          </button>
          <button
            onClick={onSaveAllTabs}
            className="px-5 py-2.5 bg-white/[0.08] hover:bg-white/[0.12] text-white/60 hover:text-white/80 text-xs font-sans rounded-lg transition-colors"
          >
            Save All Open Tabs
          </button>
        </div>
      </div>
    </div>
  );
}

export function ContentPanel() {
  const activeSpace = useActiveSpace();
  const activeProject = useActiveProject();
  const activeCategory = useActiveCategory();
  const currentGroups = useActiveGroups();
  const { addSavedGroup, addSavedTabsBatch } = useSavedSpacesStore();
  const { groupLayout, setGroupLayout, gridColumns } = useSettingsStore();
  const parentRef = useRef<HTMLDivElement>(null);

  const handleSaveAllTabs = useCallback(async () => {
    if (!activeSpace || !activeProject || !activeCategory) return;

    const windows = await chrome.windows.getAll({ populate: true });
    const allTabs = windows.flatMap(w => w.tabs ?? []).filter(t => t.url && !t.url.startsWith('chrome://'));
    if (allTabs.length === 0) return;

    const groupId = uuidv7();
    const groupName = `Saved ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

    addSavedGroup(activeSpace.id, activeProject.id, activeCategory.id, {
      id: groupId, name: groupName, tabs: [], order: currentGroups.length,
    });

    const savedTabs: SavedTab[] = await Promise.all(
      allTabs.map(async (tab, i) => ({
        id: uuidv7(), url: tab.url || '', title: tab.title || 'Untitled',
        favicon: await faviconToDataUrl(tab.favIconUrl || ''), order: i,
      })),
    );

    addSavedTabsBatch(activeSpace.id, activeProject.id, activeCategory.id, groupId, savedTabs);
  }, [activeSpace, activeProject, activeCategory, currentGroups.length, addSavedGroup, addSavedTabsBatch]);

  const handleNewGroup = useCallback(() => {
    if (!activeSpace || !activeProject || !activeCategory) return;
    addSavedGroup(activeSpace.id, activeProject.id, activeCategory.id, {
      id: uuidv7(), name: "New Group", tabs: [], order: currentGroups.length,
    });
  }, [activeSpace, activeProject, activeCategory, currentGroups.length, addSavedGroup]);

  const sortedGroups = [...currentGroups].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden min-h-0">
      {/* Category header */}
      <div className="flex justify-between items-center gap-3 px-6 py-3 border-b border-black-800 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="text-white/70 font-sans text-base font-medium truncate">
            {activeCategory?.name || 'No Category Selected'}
          </h2>
          {sortedGroups.length > 0 && (
            <span className="text-white/20 font-sans text-xs shrink-0">
              {sortedGroups.length} group{sortedGroups.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {activeCategory && sortedGroups.length > 0 && (
            <div className="flex items-center bg-white/[0.05] rounded-md p-0.5">
              <button
                onClick={() => setGroupLayout('list')}
                className={`p-1 rounded transition-colors ${groupLayout === 'list' ? 'bg-white/10 text-white/70' : 'text-white/30 hover:text-white/50'}`}
                title="List view"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                </svg>
              </button>
              <button
                onClick={() => setGroupLayout('grid')}
                className={`p-1 rounded transition-colors ${groupLayout === 'grid' ? 'bg-white/10 text-white/70' : 'text-white/30 hover:text-white/50'}`}
                title="Grid view"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
                </svg>
              </button>
            </div>
          )}
          {activeCategory && (
            <>
              <button
                onClick={handleNewGroup}
                className="text-white/60 hover:text-white/90 font-sans text-xs px-3 py-1.5 rounded-md border border-white/10 hover:border-white/25 transition-colors"
              >
                + New Group
              </button>
              <button
                onClick={handleSaveAllTabs}
                className="text-white/40 hover:text-white/70 font-sans text-xs px-3 py-1.5 rounded-md border border-white/10 hover:border-white/25 transition-colors"
              >
                Save All Tabs
              </button>
            </>
          )}
        </div>
      </div>

      {/* Groups */}
      {sortedGroups.length > 0 ? (
        <div ref={parentRef} className="flex-1 overflow-y-auto content-panel-scroll">
          <SortableContext items={sortedGroups.map(g => g.id)} strategy={verticalListSortingStrategy}>
            {sortedGroups.map((group) => (
              <SortableGroup key={group.id} group={group} layout={groupLayout} gridColumns={gridColumns} />
            ))}
          </SortableContext>
        </div>
      ) : (
        <EmptyState onSaveAllTabs={handleSaveAllTabs} onNewGroup={handleNewGroup} />
      )}
    </div>
  )
}
