import { useFlash } from "~src/hooks/useFlash";
import { Icon } from "~src/components/ui/icon"
import { SquareArrowOutUpRight } from "lucide-react"
import { useState, useRef, useEffect, useId, type ButtonHTMLAttributes } from "react";
import { SortableContext, useSortable } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { DUPLICATE_TIP, DuplicateIcon, DuplicateRibbon } from "~src/components/ui/duplicate-mark";
import { FaviconImg } from "./FaviconImg";
import { CSS } from "@dnd-kit/utilities";
import type { SavedGroup, SavedTab } from "~src/types";
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore";
import { findGroupLocation, type GroupLocation } from "~src/services/dragDrop";
import { showUndoToast } from "./ui/sonner";
import { ConfirmDialog } from "./ui/confirm-dialog";
import { Input, inlineEditFrame } from "./ui/input";
import { Badge } from "./ui/badge";
import { GroupIcon, UnsortedIcon } from "./levelIcons";
import { ensureUnsortedGroup, isUnsortedGroup } from "~src/lib/defaultPath";
import { normalizeUrl } from "~src/lib/savedUrlIndex";
import { openGroupTabs, openOrFocus } from "~src/services/openTab";
import { ACTION_ROW_END_PAD, ActionSlot, RowActions } from "./ui/row-actions";
import { IconButton, IconTooltip, isFocusVisible } from "./ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { useAltHeld, useArmAlt } from "~src/lib/altKey";
import { hasClippedText } from "~src/lib/displayUrl";
import { TabUrl } from "./TabUrl";
import { restoreLinkedTab, updateLinkedTab } from "~src/services/openLinks";
import { useMovedTabs } from "~src/hooks/useMovedTabs";
import { describeChange } from "~src/lib/describeChange";
import { useUIStore } from "~src/store/useUIStore";
import { MiddleText } from "./MiddleText";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { PickDestinationDialog } from "./PickDestinationDialog";
import { moveGroupTo, moveTabTo } from "~src/services/moveTo";
import { withPreview } from "~src/services/sortPreview";
import { useSortPreview } from "~src/store/useSortPreview";
import { useSettingsStore, type GroupLayout } from "~src/store/useSettingsStore";
import { GroupColorMenuItems } from "./GroupColorMenu";
import { GROUP_COLORS, groupColorFill, groupTintEdge, groupTintSurface } from "~src/lib/groupColors";
import type { GroupColor } from "~src/types";
import { DragHandle } from "~src/components/ui/drag-handle";
import { TextLink } from "~src/components/ui/text-link";

/** `copies`: how many tabs in this group share this address (2+ marks a duplicate). */
function SavedTabItem({ tab, groupId, location, copies = 1, unsorted }: { tab: SavedTab; groupId: string; location: GroupLocation; copies?: number; unsorted?: boolean }) {
  const isDuplicate = copies > 1;
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
  const duplicateMark = useSettingsStore((s) => s.duplicateMark);
  const duplicateTone = useSettingsStore((s) => s.duplicateTone);
  const duplicateCorner = useSettingsStore((s) => s.duplicateCorner);
  const duplicateLabel = useSettingsStore((s) => s.duplicateLabel);
  // Where a long title and link are cut, from Settings › Appearance (TASK-71).
  const titleCut = useSettingsStore((s) => s.titleCut);
  const linkCut = useSettingsStore((s) => s.linkCut);
  const linkCutScope = useSettingsStore((s) => s.linkCutScope);
  const linkRef = useRef<HTMLAnchorElement>(null);
  // The full title and link on demand (TASK-80): with "Hold Alt" it opens only
  // while Alt is held over the card (or on it by keyboard), with no delay.
  const manualPreview = useSettingsStore((s) => s.tabPreview) === "alt";
  const [overLink, setOverLink] = useState(false);
  const [overPreview, setOverPreview] = useState(false);
  const [focusedByKey, setFocusedByKey] = useState(false);
  const aimed = overLink || overPreview || focusedByKey;
  const altHeld = useAltHeld(manualPreview);
  useArmAlt(manualPreview && aimed);
  const previewOpen = manualPreview && altHeld && aimed && hasClippedText(linkRef.current);

  const onClick =(event: React.MouseEvent<HTMLAnchorElement>) => {
    // Modified/middle clicks keep the native "always open a new tab" link
    // behaviour. A plain click goes to the tab if it is already open (TASK-4).
    // With "Hold Alt" previews, Alt is part of looking, so Alt+click opens the
    // card like a plain click instead of Chrome's download.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || (event.altKey && !manualPreview)) return;
    event.preventDefault();
    void openOrFocus(tab.url, { ...location, groupId, tabId: tab.id });
  }

  // TASK-72: the page the browser tab opened from this card has moved on to
  // (next episode), kept current for every card by useWatchMovedTabs.
  const moved = useMovedTabs((s) => s.moved[tab.id]);
  const change = moved ? describeChange(tab, moved) : null;
  const updateToOpenPage = async () => {
    if (!moved || !change) return;
    const link = { ...location, groupId, tabId: tab.id };
    const before = await updateLinkedTab(link, moved);
    if (!before) return;
    useUIStore.getState().flash("tab", tab.id);
    // Short: the card is outlined right there, so the toast only needs the gist.
    const name = change.name && change.name.length > 32 ? `${change.name.slice(0, 31).trimEnd()}…` : change.name;
    showUndoToast(`Updated ${name ? `"${name}"` : "saved tab"} to ${change.to}`, () => restoreLinkedTab(link, before));
  };

  const handleDelete = () => {
    removeSavedTab(spaceId, projectId, categoryId, groupId, tab);
    showUndoToast(`Removed "${tab.title}"`, () => {
      // Removing Unsorted's last tab removes Unsorted itself; undo brings it back.
      const target = unsorted ? ensureUnsortedGroup(location) ?? groupId : groupId;
      addSavedTab(spaceId, projectId, categoryId, target, tab);
    });
  };

  // Every passive state the card shows sighted users is read with its link, in the
  // tooltip's own words (TASK-93). One sentence per visible state; a mark that is
  // switched off (Duplicate tabs: Off) shows nothing, so it says nothing.
  const statesId = useId();
  const states = [
    isDuplicate && duplicateMark !== "off" && `${DUPLICATE_TIP}.`,
    change && `Open tab is on ${change.to}.`,
  ].filter(Boolean).join(" ");

  const previewContent = (
    <span className="flex max-w-80 flex-col gap-0.5 break-words">
      <span className="text-fg">{tab.title}</span>
      <span className="break-all text-fg-subtle">{tab.url}</span>
    </span>
  );
  const cardLink = (
    <a
      ref={linkRef}
      href={tab.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open ${tab.title}`}
      aria-describedby={states ? statesId : undefined}
      className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer overflow-hidden rounded outline-none focus-visible:ring-1 focus-visible:ring-ring"
      onClick={onClick}
      {...(manualPreview ? {
        onPointerEnter: () => setOverLink(true),
        onPointerLeave: () => setOverLink(false),
        onFocus: (e: React.FocusEvent<HTMLAnchorElement>) => setFocusedByKey(isFocusVisible(e.currentTarget)),
        onBlur: () => setFocusedByKey(false),
      } : {})}
    >
      <div className="flex flex-col min-w-0">
        <MiddleText text={tab.title} className="text-fg text-xs font-sans" startShare={titleCut / 100} />
        <TabUrl url={tab.url} pathShare={linkCut / 100} scope={linkCutScope} />
      </div>
      {/* TASK-72: the browser tab opened from this card moved on (next
          episode). A passive signal like "dup"; the action lives in ⋯. */}
      {change && (
        <IconTooltip content={`Open tab is on ${change.to}`}>
          <Badge variant="accent" size="sm" className="shrink-0 max-w-[40%]">
            <span aria-hidden>→{"\u00a0"}</span>{change.to}
          </Badge>
        </IconTooltip>
      )}
      {states && <span id={statesId} className="sr-only">{states}</span>}
    </a>
  );

  return (
    <div
      ref={(el) => { setNodeRef(el); flash.ref.current = el; }}
      style={{ ...style, padding: `var(--density-py-tab) ${ACTION_ROW_END_PAD} var(--density-py-tab) var(--density-px-tab)` }}
      className={`relative flex flex-col gap-1 rounded-lg transition-[background-color,box-shadow] group bg-row hover:bg-row-hover ${flash.on ? '!ring-2 !ring-[var(--accent)]' : ''}`}
    >
      {/* A duplicate is flagged by one mark the user picks in Appearance
          (TASK-68): a ribbon across the row's top-right corner, an icon on
          the favicon, or nothing. No row tint, no box beside the title. The
          clip box keeps the row itself unclipped, so menus and rings show. */}
      {isDuplicate && duplicateMark === "ribbon" && (
        <DuplicateRibbon copies={copies} tone={duplicateTone} corner={duplicateCorner} label={duplicateLabel} />
      )}
      <div className="flex items-center gap-2.5">
        {/* Favicon slot doubles as the drag handle on hover/focus, so no empty
            gutter pushes the favicon in: favicons line up with the group icon. */}
        <span className="relative w-5 h-5 shrink-0">
          <IconTooltip content="Drag to reorder">
            <DragHandle reveal="group-hover:opacity-100" {...attributes} {...listeners} aria-label={`Reorder ${tab.title}`} />
          </IconTooltip>
          {/* Steps aside while the grip shows, as in Opened tabs: the grip sits on the row itself. */}
          <span className="grid h-5 w-5 place-items-center transition-opacity group-hover:opacity-0 peer-focus-visible:opacity-0">
            <FaviconImg src={tab.favicon} alt="" />
          </span>
          {isDuplicate && duplicateMark === "icon" && <DuplicateIcon tone={duplicateTone} />}
        </span>

        {/* The full title and address, by hover or keyboard focus, only when
            the card has cut one of them (TASK-54): a tooltip on every card
            would follow the pointer across the grid. Settings › Appearance can
            make it open only while Alt is held (TASK-80). */}
        {manualPreview ? (
          <Tooltip open={previewOpen}>
            <TooltipTrigger asChild>{cardLink}</TooltipTrigger>
            {/* Stays open while the pointer moves onto it (WCAG 1.4.13); releasing Alt closes it. */}
            <TooltipContent onPointerEnter={() => setOverPreview(true)} onPointerLeave={() => setOverPreview(false)}>
              {previewContent}
            </TooltipContent>
          </Tooltip>
        ) : (
          <IconTooltip when={() => hasClippedText(linkRef.current)} content={previewContent}>
            {cardLink}
          </IconTooltip>
        )}

        {/* Same actions as dragging and the old hover ✕, reachable by keyboard (TASK-5). */}
        <RowActions
          label={`Actions for ${tab.title}`}
          reveal="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
          items={[
            ...(change ? [{ label: `Update to ${change.to}`, onSelect: () => void updateToOpenPage() }] : []),
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
          confirmLabel="Move tab"
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
  /** The drag library's attributes and listeners for reordering the group (ContentPanel's
   *  SortableGroup): its grip takes the group mark's slot while the header is hovered (TASK-121). */
  dragHandle?: ButtonHTMLAttributes<HTMLButtonElement>;
}

export function TabGroup({ group, location, layout = 'list', gridColumns = 2, preview = false, dragHandle }: TabGroupProps) {
  const { setNodeRef: setDroppableRef, isOver: overZone, active } = useDroppable({
    id: `droppable-${group.id}`,
  });
  // The "drop into this group" look is for tabs. A dragged group never goes
  // inside another one; where it lands shows as its placeholder (TASK-64).
  const isOver = overZone && !(typeof active?.id === "string" && findGroupLocation(useSavedSpacesStore.getState().savedSpaces, active.id));
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

  // A tab dragged in from another group shows here while dragging (TASK-64).
  const sortPreview = useSortPreview((s) => s.preview);
  const shownTabs = withPreview(sortedTabs, group.id, "tab", sortPreview);

  // Detect duplicate URLs within this group
  const urlCounts = new Map<string, number>();
  for (const t of sortedTabs) {
    const norm = normalizeUrl(t.url);
    urlCounts.set(norm, (urlCounts.get(norm) || 0) + 1);
  }

  const openable = sortedTabs.filter(t => t.url);
  const urls = openable.map(t => t.url);
  // As a browser tab group when allowed (TASK-31). openGroupTabs asks for the
  // permission inside this click; declining turns the setting off, so it asks once.
  const openAll = (where: "here" | "new-window") => {
    if (!urls.length) return;
    const { openAsTabGroups, setOpenAsTabGroups } = useSettingsStore.getState();
    const links = openable.map(t => ({ ...location, groupId: group.id, tabId: t.id }));
    void openGroupTabs(urls, where, { title: group.name, color: group.color }, openAsTabGroups, links)
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
      data-group-card={preview ? undefined : group.id}
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
      <div className="flex items-center justify-between gap-2 min-h-group-head group/header" style={{ paddingLeft: 'var(--density-px-tab)', paddingRight: ACTION_ROW_END_PAD }}>
        {unsorted ? (
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-5 flex justify-center shrink-0"><UnsortedIcon size="sm" className="text-fg-subtle" /></span>
            <h3 className="text-fg-muted font-sans text-caption font-medium uppercase tracking-wider">Unsorted</h3>
            <span className="min-w-0 truncate text-fg-subtle text-xs font-sans">
              {sortedTabs.length} tab{sortedTabs.length !== 1 ? 's' : ''} · drag into a group to file them
            </span>
          </div>
        ) : isRenaming ? (
          // Icon kept and the frame's padding cancelled by negative margins, so
          // the name stays where it was and the header keeps its height (TASK-62).
          <div className={`flex flex-1 min-w-0 items-center gap-2.5 -ml-1.5 pl-1.5 pr-1.5 -my-1 py-1 text-item font-medium ${inlineEditFrame}`}>
            <span className="w-5 flex justify-center shrink-0"><GroupIcon size="sm" className="text-fg-subtle" /></span>
            <Input
              variant="inline"
              ref={renameRef}
              aria-label="Group name"
              placeholder="Group name"
              type="text"
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onBlur={handleRenameSubmit}
              onKeyDown={e => {
                if (e.key === "Enter") { e.preventDefault(); returnRenameFocus.current = true; handleRenameSubmit(); }
                if (e.key === "Escape") { e.preventDefault(); returnRenameFocus.current = true; setRenameValue(group.name); setIsRenaming(false); }
              }}
              className="flex-1"
            />
          </div>
        ) : (
          <div className="flex items-center gap-2.5 min-w-0">
            {/* The mark's slot doubles as the reorder grip on hover/focus, as a tab's favicon and a
                category's mark do (TASK-121): no grip in a gutter outside the card. */}
            <span className="relative w-5 flex justify-center shrink-0">
              {dragHandle && (
                <IconTooltip content="Drag to reorder">
                  <DragHandle reveal="group-hover/header:opacity-100" {...dragHandle} aria-label={`Reorder ${group.name}`} />
                </IconTooltip>
              )}
              {/* Steps aside while the grip shows, so the grip sits on the card itself. */}
              <span className={dragHandle ? "flex transition-opacity group-hover/header:opacity-0 peer-focus-visible:opacity-0" : "flex"}>
                <GroupIcon size="sm" className="text-fg-subtle" />
              </span>
            </span>
            <h3 className="min-w-0 text-fg-muted font-sans text-item font-medium">
              <IconTooltip content="Rename group">
                <TextLink
                  ref={renameButtonRef}
                  underline={false}
                  truncate
                  onClick={() => { setRenameValue(group.name); setIsRenaming(true); }}
                  aria-label={`Rename ${group.name}${colorLabel ? ` (${colorLabel})` : ''}`}
                >
                  {group.name}
                </TextLink>
              </IconTooltip>
            </h3>
            <span className="text-fg-subtle text-xs font-sans shrink-0">{sortedTabs.length} tab{sortedTabs.length !== 1 ? 's' : ''}</span>
          </div>
        )}
        {/* A group header is a header row (TASK-5): its primary action (open
            all) and its ⋯ (rename, move, delete) are always visible, ⋯
            outermost in the slot column. Unsorted is the system's tray: no ⋯,
            and no blank slot in its place (TASK-56). Its open-all ends at the
            tray's own edge; the tray is its own surface, so it doesn't share
            the cards' column (a blank slot read as a missing button). */}
        {!preview && <div className="flex items-center gap-0.5 shrink-0">
          {/* An empty card keeps its open-all slot so its ⋯ stays in the column;
              an empty Unsorted has nothing to hold there, so no slot either. */}
          {(!unsorted || sortedTabs.length > 0) && <ActionSlot>
            {sortedTabs.length > 0 && (
              // One "open all" control, two destinations (TASK-4).
              <DropdownMenu open={openAllMenu} onOpenChange={setOpenAllMenu}>
                <DropdownMenuTrigger asChild>
                  <IconButton aria-label={`Open all tabs in ${group.name}`} tooltip="Open all">
                    <Icon icon={SquareArrowOutUpRight} size="sm" />
                  </IconButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={openAllHere}>Open in this window</DropdownMenuItem>
                  <DropdownMenuItem onSelect={openAllInNewWindow}>Open in new window</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </ActionSlot>}
          {!unsorted && (
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
        {shownTabs.length > 0 ? (
          <SortableContext items={shownTabs.map((tab) => tab.id)}>
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
              {shownTabs.map((tab) => (
                <SavedTabItem key={tab.id} tab={tab} groupId={group.id} location={location} unsorted={unsorted} copies={urlCounts.get(normalizeUrl(tab.url)) ?? 1} />
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
          confirmLabel="Move group"
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