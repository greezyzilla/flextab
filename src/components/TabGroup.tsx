import { useState, useRef, useEffect } from "react";
import { SortableContext, useSortable } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { DragHandleIcon } from "./icons/DragHandleIcon";
import { FaviconImg } from "./FaviconImg";
import { CSS } from "@dnd-kit/utilities";
import type { SavedGroup, SavedTab } from "~src/types";
import { useSavedSpacesStore, useActiveSpace, useActiveProject, useActiveCategory } from "~src/store/useSavedSpacesStore";
import { showUndoToast } from "./UndoToast";
import type { GroupLayout } from "~src/store/useSettingsStore";

function SavedTabItem({ tab, groupId, isDuplicate }: { tab: SavedTab; groupId: string; isDuplicate?: boolean }) {
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
      style={{ ...style, padding: `var(--density-py-tab) var(--density-px-tab)` }}
      className={`flex flex-col gap-1 rounded-lg transition-colors group ${isDuplicate ? 'bg-yellow-500/[0.06] ring-1 ring-yellow-500/20' : 'bg-white/[0.03] hover:bg-white/[0.06]'}`}
    >
      <div className="flex items-center gap-2.5">
        <div
          {...attributes}
          {...listeners}
          className="opacity-0 group-hover:opacity-30 hover:!opacity-80 cursor-grab active:cursor-grabbing p-0.5 rounded transition-opacity shrink-0"
          title="Drag to reorder"
        >
          <DragHandleIcon className="w-3.5 h-3.5 text-white" />
        </div>

        <div
          className="flex items-center gap-2.5 flex-1 cursor-pointer overflow-hidden"
          onClick={onClick}
        >
          <FaviconImg src={tab.favicon} alt={tab.title} />
          <div className="flex flex-col min-w-0">
            <span className="text-white/80 text-xs font-sans truncate">{tab.title}</span>
            <span className="text-white/30 text-[10px] font-sans truncate">{tab.url?.replace(/^https?:\/\//, '')}</span>
          </div>
          {isDuplicate && (
            <span className="text-yellow-500/70 text-[10px] font-sans shrink-0" title="Duplicate URL in this group">dup</span>
          )}
        </div>

        <button
          onClick={handleDelete}
          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-white/30 hover:text-red-400 hover:bg-red-400/10 transition-all shrink-0"
          title="Remove tab"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

    </div>
  )
}

export interface TabGroupProps {
  group: SavedGroup;
  layout?: GroupLayout;
  gridColumns?: number;
}

export function TabGroup({ group, layout = 'list', gridColumns = 2 }: TabGroupProps) {
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: `droppable-${group.id}`,
  });
  const { removeSavedGroup, addSavedGroup, updateSavedGroup } = useSavedSpacesStore();
  const activeSpace = useActiveSpace();
  const activeProject = useActiveProject();
  const activeCategory = useActiveCategory();
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(group.name);
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming && renameRef.current) {
      renameRef.current.focus();
      renameRef.current.select();
    }
  }, [isRenaming]);

  // Sort tabs by order field to maintain consistent ordering
  const sortedTabs = [...(group.tabs || [])].sort((a, b) => {
    const orderA = a.order ?? 0;
    const orderB = b.order ?? 0;
    return orderA - orderB;
  });

  // Detect duplicate URLs within this group
  const urlCounts = new Map<string, number>();
  for (const t of sortedTabs) {
    const norm = t.url?.replace(/\/$/, '') || '';
    urlCounts.set(norm, (urlCounts.get(norm) || 0) + 1);
  }
  const duplicateUrls = new Set([...urlCounts.entries()].filter(([, c]) => c > 1).map(([u]) => u));

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

  const handleRenameSubmit = () => {
    if (!activeSpace || !activeProject || !activeCategory) return;
    if (renameValue.trim() && renameValue.trim() !== group.name) {
      updateSavedGroup(activeSpace.id, activeProject.id, activeCategory.id, { ...group, name: renameValue.trim() });
    }
    setIsRenaming(false);
  };

  return (
    <div className="flex flex-col gap-2" style={{ padding: 'var(--density-p-section)' }}>
      <div className="flex items-center justify-between pl-7 group/header">
        {isRenaming ? (
          <input
            ref={renameRef}
            type="text"
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={e => {
              if (e.key === "Enter") handleRenameSubmit();
              if (e.key === "Escape") { setRenameValue(group.name); setIsRenaming(false); }
            }}
            className="bg-white/10 text-white/90 px-2 py-0.5 rounded outline-none focus:ring-1 focus:ring-[var(--accent)] font-sans text-sm"
          />
        ) : (
          <div className="flex items-center gap-2.5 min-w-0">
            <h3
              className="text-white/60 font-sans text-sm cursor-pointer hover:text-white/80 transition-colors truncate"
              onDoubleClick={() => { setRenameValue(group.name); setIsRenaming(true); }}
              title="Double-click to rename"
            >
              {group.name}
            </h3>
            <span className="text-white/20 text-xs font-sans shrink-0">{sortedTabs.length} tab{sortedTabs.length !== 1 ? 's' : ''}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          {sortedTabs.length > 0 && (
            <button
              onClick={handleOpenAll}
              className="text-white/30 hover:text-white/60 font-sans text-xs transition-colors opacity-0 group-hover/header:opacity-100"
              title="Open all tabs in new window"
            >
              Open All
            </button>
          )}
          <button
            onClick={handleDeleteGroup}
            className="text-white/20 hover:text-red-400 transition-colors opacity-0 group-hover/header:opacity-100"
            title="Delete group"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
      <div ref={setDroppableRef}>
        {sortedTabs.length > 0 ? (
          <SortableContext items={sortedTabs.map((tab) => tab.id)}>
            <div
              className={`rounded-xl border transition-colors ${isOver ? '' : 'border-black-800'} ${
                layout === 'grid' ? 'grid' : 'flex flex-col'
              }`}
              style={{
                padding: 'var(--density-p-group)',
                gap: 'var(--density-gap-group)',
                ...(layout === 'grid' ? { gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))` } : {}),
                ...(isOver ? { borderColor: 'var(--accent)', backgroundColor: 'var(--accent-subtle)' } : {}),
              }}
            >
              {sortedTabs.map((tab) => (
                <SavedTabItem key={tab.id} tab={tab} groupId={group.id} isDuplicate={duplicateUrls.has(tab.url?.replace(/\/$/, '') || '')} />
              ))}
            </div>
          </SortableContext>
        ) : (
          <div
            className={`text-white/30 font-sans text-xs py-8 text-center rounded-xl border border-dashed transition-colors ${isOver ? '' : 'border-black-800'}`}
            style={isOver ? { borderColor: 'var(--accent)', backgroundColor: 'var(--accent-subtle)', color: 'var(--accent)' } : undefined}
          >
            {isOver ? 'Drop tab here' : 'Drag tabs here to save'}
          </div>
        )}
      </div>
    </div>
  )
}