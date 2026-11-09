import { useFlash } from "~src/hooks/useFlash";
import { useState, useRef, useEffect } from "react";
import { SortableContext, useSortable } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { DragHandleIcon } from "./icons/DragHandleIcon";
import { FaviconImg } from "./FaviconImg";
import { CSS } from "@dnd-kit/utilities";
import type { SavedGroup, SavedTab } from "~src/types";
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore";
import type { GroupLocation } from "~src/services/dragDrop";
import { showUndoToast } from "./ui/sonner";
import { ConfirmDialog } from "./ui/confirm-dialog";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { GroupIcon, UnsortedIcon } from "./levelIcons";
import { ensureUnsortedGroup, isUnsortedGroup } from "~src/lib/defaultPath";
import { normalizeUrl } from "~src/lib/savedUrlIndex";
import { openGroupTabs, openOrFocus } from "~src/services/openTab";
import { ActionSlot, RowActions } from "./ui/row-actions";
import { Tooltip, TooltipTrigger, TooltipContent } from "./ui/tooltip";
import { IconButton } from "./ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { PickDestinationDialog } from "./PickDestinationDialog";
import { moveGroupTo, moveTabTo } from "~src/services/moveTo";
import { useSettingsStore, type GroupLayout } from "~src/store/useSettingsStore";
import { GroupColorMenuItems } from "./GroupColorMenu";
import { GROUP_COLORS, groupColorFill, groupTintEdge, groupTintSurface } from "~src/lib/groupColors";
import type { GroupColor } from "~src/types";

function SavedTabItem({ tab, groupId, location, isDuplicate, unsorted }: { tab: SavedTab; groupId: string; location: GroupLocation; isDuplicate?: boolean; unsorted?: boolean }) {
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
  const { spaceId, projectId, categoryId } = location;
  const [moving, setMoving] = useState(false);
  const flash = useFlash<HTMLDivElement>("tab", tab.id);

  const onClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    // Modified/middle clicks keep the native "always open a new tab" link
    // behaviour. A plain click goes to the tab if it is already open (TASK-4).
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    void openOrFocus(tab.url);
  }

  const handleDelete = () => {
    removeSavedTab(spaceId, projectId, categoryId, groupId, tab);
    showUndoToast(`Removed "${tab.title}"`, () => {
      // Removing Unsorted's last tab removes Unsorted itself; undo brings it back.
      const target = unsorted ? ensureUnsortedGroup(location) ?? groupId : groupId;
      addSavedTab(spaceId, projectId, categoryId, target, tab);
    });
  };

  return (
    <div
      ref={(el) => { setNodeRef(el); flash.ref.current = el; }}
      style={{ ...style, padding: `var(--density-py-tab) var(--density-px-tab)` }}
      className={`flex flex-col gap-1 rounded-lg transition-[background-color,box-shadow] group ${isDuplicate ? 'bg-yellow-500/[0.06] ring-1 ring-yellow-500/20' : 'bg-row hover:bg-row-hover'} ${flash.on ? '!ring-2 !ring-[var(--accent)]' : ''}`}
    >
      <div className="flex items-center gap-2.5">
        {/* Favicon slot doubles as the drag handle on hover/focus, so no empty
            gutter pushes the favicon in: favicons line up with the group icon. */}
        <span className="relative w-5 h-5 shrink-0">
          <FaviconImg src={tab.favicon} alt="" />
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label={`Reorder ${tab.title}`}
            className="absolute -inset-0.5 flex items-center justify-center rounded bg-black-800 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-ring outline-none cursor-grab active:cursor-grabbing transition-opacity"
            title="Drag to reorder"
          >
            <DragHandleIcon className="w-3.5 h-3.5 text-fg-muted" />
          </button>
        </span>

        <a
          href={tab.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${tab.title}`}
          className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer overflow-hidden rounded outline-none focus-visible:ring-1 focus-visible:ring-ring"
          onClick={onClick}
        >
          <div className="flex flex-col min-w-0">
            <span className="text-fg text-xs font-sans truncate">{tab.title}</span>
            <span className="text-fg-subtle text-[10px] font-sans truncate">{tab.url?.replace(/^https?:\/\//, '')}</span>
          </div>
          {isDuplicate && (
            <Badge variant="warning" size="sm" className="shrink-0 font-normal" title="Duplicate URL in this group">dup</Badge>
          )}
        </a>

        {/* Same actions as dragging and the old hover ✕, reachable by keyboard (TASK-5). */}
        <RowActions
          label={`Actions for ${tab.title}`}
          reveal="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
          items={[
            { label: "Move to…", onSelect: () => setMoving(true) },
            { label: "Remove", onSelect: handleDelete, danger: true, separatorBefore: true },
          ]}
        />
      </div>
      {moving && (
        <PickDestinationDialog
          title="Move tab"
          description={`Move “${tab.title}” to another group.`}
          groupLevel
          initial={{ spaceId, projectId, categoryId, groupId }}
          confirmLabel="Move"
          onConfirm={(target) => moveTabTo({ ...location, groupId }, tab.id, target)}
          onClose={() => setMoving(false)}
        />
      )}

    </div>
  )
}

/** Side padding of a group block: the same 1.5rem (px-6) as the category
 * header, so headers and cards share one left edge at every density. */
export const GROUP_INLINE = '1.5rem';
/** Narrowest grid cell: favicon + a title of ~30 characters. */
export const GRID_MIN_CELL = '15rem';

/**
 * The one empty-state row for a drop target (an empty group or an empty
 * category): a thin dashed row with one line of text, no buttons. Creating
 * things stays in the headers, so the row never competes with them.
 */
export function EmptyDropRow({ isOver, label }: { isOver: boolean; label: string }) {
  return (
    // As tall as one saved-tab row at every density, so an empty slot keeps
    // the same rhythm as a filled one and is a comfortable drop target.
    <div
      className={`flex items-center font-sans text-xs rounded-lg border border-dashed transition-colors ${isOver ? 'border-transparent' : 'border-ink/[0.12] text-fg-subtle'}`}
      style={{
        minHeight: 'calc(var(--density-py-tab) * 2 + 2rem)',
        paddingInline: 'var(--density-px-tab)',
        ...(isOver ? { color: 'var(--accent-text)', backgroundColor: 'var(--accent-subtle)' } : {}),
      }}
    >
      {isOver ? 'Drop here' : label}
    </div>
  );
}

export interface TabGroupProps {
  group: SavedGroup;
  /** Where the group lives. The project page shows groups from every
   * category, so the active category is not necessarily this group's. */
  location: GroupLocation;
  layout?: GroupLayout;
  gridColumns?: number;
  /** A look-only rendering (Settings › Appearance preview, TASK-30): no header
   *  actions, so nothing that looks clickable is shown where nothing can be done. */
  preview?: boolean;
}

export function TabGroup({ group, location, layout = 'list', gridColumns = 2, preview = false }: TabGroupProps) {
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: `droppable-${group.id}`,
  });
  const { removeSavedGroup, addSavedGroup, updateSavedGroup } = useSavedSpacesStore();
  const { spaceId, projectId, categoryId } = location;
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(group.name);
  const renameRef = useRef<HTMLInputElement>(null);
  const renameButtonRef = useRef<HTMLButtonElement>(null);
  const returnRenameFocus = useRef(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [movingGroup, setMovingGroup] = useState(false);
  const [openAllMenu, setOpenAllMenu] = useState(false);
  // The colour highlighted in ⋯ › Color, shown live before it is picked.
  const [previewColor, setPreviewColor] = useState<GroupColor | "none" | null>(null);

  useEffect(() => {
    if (isRenaming && renameRef.current) {
      renameRef.current.focus();
      renameRef.current.select();
    } else if (returnRenameFocus.current) {
      returnRenameFocus.current = false;
      renameButtonRef.current?.focus();
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
    const norm = normalizeUrl(t.url);
    urlCounts.set(norm, (urlCounts.get(norm) || 0) + 1);
  }
  const duplicateUrls = new Set([...urlCounts.entries()].filter(([, c]) => c > 1).map(([u]) => u));

  const urls = sortedTabs.map(t => t.url).filter(Boolean);
  // As a browser tab group when allowed (TASK-31). openGroupTabs asks for the
  // permission inside this click; declining turns the setting off, so it asks once.
  const openAll = (where: "here" | "new-window") => {
    if (!urls.length) return;
    const { openAsTabGroups, setOpenAsTabGroups } = useSettingsStore.getState();
    void openGroupTabs(urls, where, { title: group.name, color: group.color }, openAsTabGroups)
      .then(({ permission }) => { if (permission === "declined") setOpenAsTabGroups(false); });
  };
  const openAllInNewWindow = () => openAll("new-window");
  const openAllHere = () => openAll("here");

  const handleDeleteGroup = () => {
    removeSavedGroup(spaceId, projectId, categoryId, group);
    showUndoToast(`Deleted group "${group.name}"`, () => {
      addSavedGroup(spaceId, projectId, categoryId, group);
    });
  };

  const setColor = (color: SavedGroup["color"]) => {
    const next: SavedGroup = { ...group };
    if (color) next.color = color; else delete next.color;
    updateSavedGroup(spaceId, projectId, categoryId, next);
  };
  const colorLabel = group.color ? GROUP_COLORS.find((c) => c.id === group.color)?.label : undefined;
  const shownColor = previewColor === "none" ? undefined : previewColor ?? group.color;

  const handleRenameSubmit = () => {
    if (renameValue.trim() && renameValue.trim() !== group.name) {
      updateSavedGroup(spaceId, projectId, categoryId, { ...group, name: renameValue.trim() });
    }
    setIsRenaming(false);
  };

  // Unsorted (TASK-20): the category's system tray for tabs saved without a
  // group. It reads as the system's, not the user's: a fixed uppercase label
  // (not an editable name), a borderless tinted tray (not a bordered card),
  // no rename, no delete, and a hint saying what to do with it.
  const unsorted = isUnsortedGroup(group);
  const flash = useFlash<HTMLDivElement>("group", group.id);

  return (
    // Space only ABOVE each group: a section then ends exactly at its last
    // card, so its sticky header leaves together with its last content.
    // One vertical rhythm G (--density-p-section): header→first card and
    // card→card are both G.
    <div style={{ paddingTop: 'var(--density-p-section)', paddingInline: GROUP_INLINE }}>
    {/* One region per group: its title, actions and tabs share one boundary
        (bordered card for user groups, borderless tinted tray for Unsorted). */}
    <div
      ref={(el) => { setDroppableRef(el); flash.ref.current = el; }}
      className={`flex flex-col rounded-card border transition-[background-color,box-shadow,border-color] ${isOver || shownColor ? '' : unsorted ? 'border-transparent bg-ink/[0.04]' : 'border-ink/[0.08] bg-ink/[0.015]'} ${flash.on ? 'ring-2 ring-[var(--accent)]' : ''}`}
      style={{
        padding: 'var(--density-p-group)',
        gap: 'var(--density-p-group)',
        // A coloured group (TASK-18) is tinted as a whole: its surface and
        // edge take the colour's hue at the surface's own lightness, so the
        // region the ⋯ menu belongs to is what changes, and the colour stays
        // in view while its tabs scroll.
        ...(shownColor && !isOver ? {
          borderColor: groupTintEdge(shownColor),
          backgroundColor: groupTintSurface(shownColor),
        } : {}),
        // Drop target: an uncoloured group lights up in the accent; a coloured
        // one keeps its own hue and leans in (full-colour edge, deeper tint),
        // so a drop never repaints the group in a colour it doesn't have.
        ...(isOver && !shownColor ? { borderColor: 'var(--accent)', backgroundColor: 'var(--accent-subtle)' } : {}),
        ...(isOver && shownColor ? { borderColor: groupColorFill(shownColor), backgroundColor: groupTintSurface(shownColor, { strength: 2 }) } : {}),
      }}
    >
      <div className="flex items-center justify-between gap-2 min-h-[26px] group/header" style={{ paddingInline: 'var(--density-px-tab)' }}>
        {unsorted ? (
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-5 flex justify-center shrink-0"><UnsortedIcon className="h-3.5 w-3.5 text-fg-subtle" /></span>
            <h3 className="text-fg-muted font-sans text-[11px] font-medium uppercase tracking-wider">Unsorted</h3>
            <span className="min-w-0 truncate text-fg-subtle text-xs font-sans">
              {sortedTabs.length} tab{sortedTabs.length !== 1 ? 's' : ''} · drag into a group to file them
            </span>
          </div>
        ) : isRenaming ? (
          <Input
            variant="inline"
            ref={renameRef}
            aria-label="Group name"
            type="text"
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={e => {
              if (e.key === "Enter") { e.preventDefault(); returnRenameFocus.current = true; handleRenameSubmit(); }
              if (e.key === "Escape") { e.preventDefault(); returnRenameFocus.current = true; setRenameValue(group.name); setIsRenaming(false); }
            }}
          />
        ) : (
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-5 flex justify-center shrink-0"><GroupIcon className="h-3.5 w-3.5 text-fg-subtle" /></span>
            <h3 className="min-w-0 text-fg-muted font-sans text-[13px] font-medium">
              <button
                ref={renameButtonRef}
                type="button"
                className="block max-w-full text-left truncate rounded outline-none focus-visible:ring-1 focus-visible:ring-ring hover:text-fg transition-colors"
                onClick={() => { setRenameValue(group.name); setIsRenaming(true); }}
                aria-label={`Rename ${group.name}${colorLabel ? ` (${colorLabel})` : ''}`}
                title="Rename group"
              >
                {group.name}
              </button>
            </h3>
            <span className="text-fg-subtle text-xs font-sans shrink-0">{sortedTabs.length} tab{sortedTabs.length !== 1 ? 's' : ''}</span>
          </div>
        )}
        {/* A group header is a header row (TASK-5): its primary action (open
            all) and its ⋯ (rename, move, delete) are always visible, ⋯
            outermost in the slot column. Unsorted is the system's tray: no ⋯,
            but its slot stays so its open-all lines up with the others. */}
        {!preview && <div className="flex items-center gap-0.5 shrink-0">
          <ActionSlot>
            {sortedTabs.length > 0 && (
              // One "open all" control, two destinations (TASK-4).
              <DropdownMenu open={openAllMenu} onOpenChange={setOpenAllMenu}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <IconButton aria-label={`Open all tabs in ${group.name}`} className={openAllMenu ? 'bg-ink/10 text-fg' : ''}>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13 5h6v6M19 5l-8 8M11 5H6a1 1 0 00-1 1v12a1 1 0 001 1h12a1 1 0 001-1v-5" />
                        </svg>
                      </IconButton>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent>Open all</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={openAllHere}>Open in this window</DropdownMenuItem>
                  <DropdownMenuItem onSelect={openAllInNewWindow}>Open in new window</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </ActionSlot>
          {unsorted ? <ActionSlot /> : (
            <RowActions
              label={`Actions for ${group.name}`}
              items={[
                { label: "Rename", onSelect: () => { setRenameValue(group.name); setIsRenaming(true); }, takesFocus: true },
                { label: "Color", onSelect: () => {}, sub: <GroupColorMenuItems value={group.color} onChange={setColor} onPreview={setPreviewColor} /> },
                { label: "Move to…", onSelect: () => setMovingGroup(true) },
                { label: "Delete", onSelect: () => setShowDeleteConfirm(true), danger: true, separatorBefore: true },
              ]}
            />
          )}
        </div>}
      </div>
        {sortedTabs.length > 0 ? (
          <SortableContext items={sortedTabs.map((tab) => tab.id)}>
            <div
              className={layout === 'grid' ? 'grid' : 'flex flex-col'}
              style={{
                gap: 'var(--density-gap-group)',
                // Fluid grid: render up to `gridColumns` columns, but collapse to
                // fewer when the container gets too narrow to keep cells >=
                // GRID_MIN_CELL, wide enough for a readable title (TASK-25; at
                // 150px a 4-column grid cut titles after ~12 characters).
                ...(layout === 'grid'
                  ? {
                      gridTemplateColumns: `repeat(auto-fill, minmax(max(${GRID_MIN_CELL}, calc((100% - ${gridColumns - 1} * var(--density-gap-group)) / ${gridColumns})), 1fr))`,
                    }
                  : {}),
              }}
            >
              {sortedTabs.map((tab) => (
                <SavedTabItem key={tab.id} tab={tab} groupId={group.id} location={location} unsorted={unsorted} isDuplicate={duplicateUrls.has(normalizeUrl(tab.url))} />
              ))}
            </div>
          </SortableContext>
        ) : (
          <EmptyDropRow isOver={false} label="No tabs yet. Drag tabs here." />
        )}
    </div>

      {movingGroup && (
        <PickDestinationDialog
          title="Move group"
          description={`Move “${group.name}” and its ${sortedTabs.length} tab${sortedTabs.length === 1 ? "" : "s"} to another category.`}
          initial={{ spaceId, projectId, categoryId }}
          confirmLabel="Move"
          onConfirm={(target) => moveGroupTo(location, group.id, target)}
          onClose={() => setMovingGroup(false)}
        />
      )}

      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title="Delete group?"
        message={
          <>
            This permanently removes <span className="text-fg">{group.name}</span> and its{" "}
            {sortedTabs.length} saved tab{sortedTabs.length !== 1 ? "s" : ""}.
          </>
        }
        confirmLabel="Delete group"
        onConfirm={handleDeleteGroup}
      />
    </div>
  )
}