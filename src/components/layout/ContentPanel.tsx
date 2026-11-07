import { useActiveCategory, useActiveSpace, useActiveProject, useSavedSpacesStore } from "~src/store/useSavedSpacesStore";
import { ShortcutTooltip } from "~src/components/ui/kbd";
import { shortcutLabel } from "~src/lib/platform";
import { useCommandShortcuts } from "~src/hooks/useCommandShortcuts";
import { commitOnBlur } from "~src/lib/inlineEdit";
import type { SavedCategory, SavedGroup, SavedProject, SavedSpace } from "~src/types";
import { EmptyDropRow, GROUP_INLINE, TabGroup } from "../TabGroup";
import { Tooltip, TooltipTrigger, TooltipContent } from "~src/components/ui/tooltip";
import { Button } from "~src/components/ui/button";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { DragHandleIcon } from "../icons/DragHandleIcon";
import { useRef, useCallback, useEffect, useState } from "react";
import { Input } from "~src/components/ui/input";
import { v7 as uuidv7 } from "uuid";
import { useSettingsStore, type GroupLayout } from "~src/store/useSettingsStore";
import { useUIStore } from "~src/store/useUIStore";
import type { GroupLocation } from "~src/services/dragDrop";
import { CategoryIcon, GroupIcon, ProjectIcon, SpaceAvatar } from "~src/components/levelIcons";
import { findUnsorted, firstGroupOrder, isUnsortedGroup, orderedGroups } from "~src/lib/defaultPath";
import { spacesHaveTabs } from "~src/services/spacesTree";
import { ArrowRight } from "lucide-react";

/**
 * The project page. A project is one page; its categories are sections on it
 * (selecting a category in the sidebar scrolls to its section). Every level
 * stays visible and named — the page just stops making the user click through
 * categories one at a time to see a project.
 */

function SortableGroup({ group, location, layout, gridColumns }: {
  group: SavedGroup; location: GroupLocation; layout: GroupLayout; gridColumns: number;
}) {
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
      {/* The handle sits in the left gutter, level with the title row inside the card
          (block top padding + card padding + half of the 26px title row - half the icon). */}
      <div className="absolute left-1 z-10 opacity-0 group-hover/sortable:opacity-30 hover:!opacity-80 focus-visible:!opacity-100 focus-visible:ring-1 focus-visible:ring-ring outline-none rounded transition-opacity cursor-grab active:cursor-grabbing"
        style={{ top: 'calc(var(--density-p-section) + var(--density-p-group) + 5px)' }} {...attributes} {...listeners}
        aria-label={`Reorder ${group.name}`}>
        <DragHandleIcon className="w-4 h-4 text-fg-subtle" />
      </div>
      <TabGroup group={group} location={location} layout={layout} gridColumns={gridColumns} />
    </div>
  );
}

/**
 * The current section is the first one still visible at the top edge: the one
 * whose header is pinned or being pushed out, or (between two sections) the
 * next one, so the breadcrumb always names the header the user sees at the
 * top. +1: sections overlap by their 1px top line (-mt-px), which must not
 * keep the previous section current.
 */
function sectionAtTop(container: HTMLElement): string | null {
  const line = container.scrollTop + 1;
  for (const section of container.querySelectorAll<HTMLElement>("[data-category-id]")) {
    if (section.offsetTop + section.offsetHeight > line) return section.dataset.categoryId ?? null;
  }
  return null;
}

/** Empty states name the level and say what it is for, once, where it is empty. */
function LevelEmptyState({ icon, title, body, action }: {
  icon: React.ReactNode; title: string; body: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex-1 flex items-center justify-center p-12">
      <div className="flex flex-col items-center gap-5 max-w-sm text-center">
        <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-center text-fg-subtle">
          {icon}
        </div>
        <div className="flex flex-col gap-2">
          <h2 className="text-fg font-sans text-sm font-medium">{title}</h2>
          <p className="text-fg-subtle font-sans text-xs leading-relaxed">{body}</p>
        </div>
        {action}
      </div>
    </div>
  );
}

/**
 * Empty-state "New project… / New category…": the name input opens right
 * where the button was, so the result of the click shows at the point of
 * attention (not in the far-left sidebar). Enter creates, Esc / an empty name
 * puts the button back.
 */
function InlineCreate({ label, placeholder, inputLabel, startEditing = false, onCommit, onCancel }: {
  label: string; placeholder: string; inputLabel: string; startEditing?: boolean;
  onCommit: (name: string) => void; onCancel?: () => void;
}) {
  const [editing, setEditing] = useState(startEditing);
  const [value, setValue] = useState("");
  useEffect(() => { if (startEditing) setEditing(true); }, [startEditing]);

  const finish = (commit: boolean) => {
    const name = value.trim();
    setEditing(false);
    setValue("");
    if (commit && name) onCommit(name); else onCancel?.();
  };
  // Both states take the same space (fixed control row, hint line always
  // reserved), so swapping button ↔ input doesn't shift the centred block.
  return (
    <div className="flex w-64 flex-col items-center gap-1.5">
      <div className="flex h-9 w-full items-center justify-center">
        {editing ? (
          <Input
            autoFocus
            aria-label={inputLabel}
            placeholder={placeholder}
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") { e.preventDefault(); finish(true); }
              if (e.key === "Escape") { e.preventDefault(); finish(false); }
            }}
            onBlur={commitOnBlur(() => finish(true))}
            className="w-full text-center"
          />
        ) : (
          <Button variant="default" size="sm" onClick={() => setEditing(true)}>{label}…</Button>
        )}
      </div>
      <span className={`text-[11px] text-fg-subtle font-sans ${editing ? "" : "invisible"}`}>Enter to create · Esc to cancel</span>
    </div>
  );
}

/**
 * "+ New group": the name row opens at the top of the section, where the new
 * group will be (below Unsorted), so the result shows where the user looks.
 * Enter creates, Esc / an empty name cancels; nothing is written before.
 */
function NewGroupRow({ categoryName, onCommit, onCancel }: {
  categoryName: string; onCommit: (name: string) => void; onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  const done = useRef(false);
  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    const name = value.trim();
    if (commit && name) onCommit(name); else onCancel();
  };
  return (
    // Same card shell as the group it will become (title row inside the card),
    // so the row doesn't change shape or position when Enter creates it.
    <div style={{ paddingTop: 'var(--density-p-section)', paddingInline: GROUP_INLINE }}>
    <div className="flex flex-col gap-1 rounded-xl border border-white/[0.08] bg-white/[0.015]" style={{ padding: 'var(--density-p-group)' }}>
      <div className="flex items-center gap-2.5" style={{ paddingInline: 'var(--density-px-tab)' }}>
        <span className="w-5 flex justify-center shrink-0"><GroupIcon className="h-3.5 w-3.5 text-fg-subtle" /></span>
        <Input
          variant="inline"
          autoFocus
          aria-label={`New group name in ${categoryName}`}
          placeholder="Group name"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") { e.preventDefault(); finish(true); }
            if (e.key === "Escape") { e.preventDefault(); finish(false); }
          }}
          onBlur={commitOnBlur(() => finish(true))}
        />
      </div>
      <span className="text-[11px] text-fg-subtle font-sans" style={{ paddingLeft: 'calc(var(--density-px-tab) + 1.25rem + 0.625rem)' }}>Enter to create · Esc to cancel</span>
    </div>
    </div>
  );
}

/**
 * Drop zone for a category that has no groups yet (tabs or whole groups).
 * While the whole workspace is still empty (first run, TASK-7) it is also the
 * guidance: where to drag from, one real save action, and the shortcut. It
 * goes away by itself once anything is saved, so it needs no dismiss.
 */
function EmptySectionDrop({ location }: { location: GroupLocation }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `section-drop:${location.spaceId}:${location.projectId}:${location.categoryId}`,
  });
  const firstRun = useSavedSpacesStore((s) => !spacesHaveTabs(s.savedSpaces));
  const { setActiveCategory } = useSavedSpacesStore();
  const setSaveAllOpen = useUIStore((s) => s.setSaveAllOpen);
  // The keys as set in Chrome now; no sentence when the command was cleared.
  const savePage = useCommandShortcuts(firstRun)["save-page"];
  if (!firstRun || isOver) {
    return (
      <div ref={setNodeRef}>
        <EmptyDropRow isOver={isOver} label="No groups yet. Drag tabs here." />
      </div>
    );
  }
  return (
    <div
      ref={setNodeRef}
      className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-lg border border-dashed border-white/[0.12] font-sans"
      style={{ padding: 'var(--density-p-group) var(--density-px-tab)' }}
    >
      <div className="flex flex-col gap-1">
        <span className="flex items-center gap-1.5 text-fg-muted text-sm">
          Drag tabs here from Opened Tabs
          <ArrowRight className="h-3.5 w-3.5 text-fg-subtle" aria-hidden />
        </span>
        {savePage && <span className="text-fg-subtle text-xs">Or press {shortcutLabel(savePage)} on any page to save it.</span>}
      </div>
      <ShortcutTooltip label="Save all tabs" shortcut="Mod+Shift+S" side="left">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => { setActiveCategory(location.categoryId); setSaveAllOpen(true); }}
        >
          Save all tabs
        </Button>
      </ShortcutTooltip>
    </div>
  );
}

function CategorySection({ space, project, category, layout, gridColumns, isCurrent, isFirst, isLast }: {
  space: SavedSpace; project: SavedProject; category: SavedCategory;
  layout: GroupLayout; gridColumns: number; isCurrent: boolean; isFirst: boolean; isLast: boolean;
}) {
  const { addSavedGroup, setActiveCategory } = useSavedSpacesStore();
  const naming = useUIStore(s => s.namingGroupIn === category.id);
  const { startNamingGroup, endNamingGroup } = useUIStore();
  const location: GroupLocation = { spaceId: space.id, projectId: project.id, categoryId: category.id };
  // Unsorted (if any) is first and fixed; the user's groups follow, sortable.
  const unsorted = findUnsorted(category);
  const groups = orderedGroups(category.groups).filter(g => !isUnsortedGroup(g));

  const newGroup = () => {
    setActiveCategory(category.id);
    startNamingGroup(category.id);
  };
  // A new group goes first, right below Unsorted (not to the bottom).
  const createGroup = (name: string) => {
    endNamingGroup();
    addSavedGroup(space.id, project.id, category.id, {
      id: uuidv7(), name, tabs: [], order: firstGroupOrder(category.groups),
    });
  };
  const unsortedCount = unsorted?.tabs.length ?? 0;
  const counts = [
    // An empty category shows no "0 groups": its empty row already says so.
    ...(groups.length > 0 ? [`${groups.length} group${groups.length !== 1 ? 's' : ''}`] : []),
    ...(unsorted ? [`${unsortedCount} unsorted`] : []),
  ].join(' · ');

  return (
    // Ownership on a page with several categories:
    // - The header looks the same in every state (bar + its own bottom line),
    //   resting or pinned, so it always reads as the head of what is below it.
    // - The header is a closed band: a line on top (the section's own start
    //   edge; for the first section the page header's line plays this role)
    //   and its own line below. So a header never blends into the previous
    //   section's trailing space; that space (2G) ends at the next top line.
    // - Sections touch: the next header pushes the pinned one out directly,
    //   so while scrolling (even slowly) there is always exactly one pinned
    //   header and it always belongs to the content right under it.
    // - The last section is at least one viewport tall, so the last category
    //   can be pinned (owned) like every other one.
    // Left edge: category icon, group headers and group cards all start at the
    // same 1.5rem line; levels differ by type size, not by indentation.
    <section data-category-id={category.id} aria-labelledby={`section-${category.id}`}
      // -mt-px: the top line overlaps the previous section's last pixel, so
      // while the previous header is pushed out its bottom line and this top
      // line coincide (one line, never a double line).
      className={`${isFirst ? '' : '-mt-px border-t border-white/[0.12]'} ${isLast ? 'min-h-full' : ''}`}>
      <div className="sticky top-0 z-20 bg-black-900 h-12 px-6 flex items-center justify-between gap-3 border-b border-white/[0.12]">
        {/* h2 under the panel's h1 (the space); groups are h3 (TASK-28). */}
        <h2 id={`section-${category.id}`} className={`flex items-center gap-2 min-w-0 font-sans text-base ${isCurrent ? 'text-fg' : 'text-fg'}`}>
          <CategoryIcon className="h-4 w-4 shrink-0" />
          <span className="truncate font-semibold">{category.name}</span>
          {counts && <span className="text-fg-subtle text-xs font-normal shrink-0">{counts}</span>}
        </h2>
        {/* Always here, empty or not: one place to create a group. */}
        <ShortcutTooltip label="New group" shortcut="N" side="left">
          <Button variant="ghost" size="sm" onClick={newGroup} aria-label={`New group in ${category.name}`}>+ New group</Button>
        </ShortcutTooltip>
      </div>
      {unsorted && <TabGroup group={unsorted} location={location} layout={layout} gridColumns={gridColumns} />}
      {naming && <NewGroupRow categoryName={category.name} onCommit={createGroup} onCancel={endNamingGroup} />}
      {groups.length > 0 ? (
        <SortableContext items={groups.map(g => g.id)} strategy={verticalListSortingStrategy}>
          {groups.map((group) => (
            <SortableGroup key={group.id} group={group} location={location} layout={layout} gridColumns={gridColumns} />
          ))}
        </SortableContext>
      ) : !unsorted && !naming && (
        <div className="px-6" style={{ paddingTop: 'var(--density-p-section)' }}>
          <EmptySectionDrop location={location} />
        </div>
      )}
      {/* Section end space (2G) as content, not padding: sticky stays within
          the content box, so padding would push the header out early and
          leave a moment with no header at the top. */}
      {!isLast && <div aria-hidden style={{ height: 'calc(var(--density-p-section) * 2)' }} />}
    </section>
  );
}

function Breadcrumb({ space, project, category, onProject, onCategory }: {
  space?: SavedSpace; project?: SavedProject; category?: SavedCategory;
  onProject: () => void; onCategory: () => void;
}) {
  const sep = <span aria-hidden className="text-fg-subtle">›</span>;
  return (
    <nav aria-label="Location" className="flex items-center gap-1.5 min-w-0 font-sans text-sm">
      <span className="flex items-center gap-1.5 min-w-0 text-fg-muted">
        <SpaceAvatar space={space} />
        <span className="truncate max-w-[10rem]">{space?.name ?? 'No space'}</span>
      </span>
      {project && (
        <>
          {sep}
          <button type="button" onClick={onProject}
            className="flex items-center gap-1.5 min-w-0 rounded px-1 -mx-1 text-fg hover:text-white outline-none focus-visible:ring-1 focus-visible:ring-ring">
            <ProjectIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate max-w-[14rem] font-medium">{project.name}</span>
          </button>
        </>
      )}
      {project && category && (
        <>
          {sep}
          <button type="button" onClick={onCategory} aria-current="location"
            className="flex items-center gap-1.5 min-w-0 rounded px-1 -mx-1 text-fg-muted hover:text-fg outline-none focus-visible:ring-1 focus-visible:ring-ring">
            <CategoryIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate max-w-[12rem]">{category.name}</span>
          </button>
        </>
      )}
    </nav>
  );
}

export function ContentPanel() {
  const activeSpace = useActiveSpace();
  const activeProject = useActiveProject();
  const activeCategory = useActiveCategory();
  const { setActiveCategory, setActiveProject, addSavedProject, addSavedCategory, toggleExpandedProject } = useSavedSpacesStore();
  const { groupLayout, setGroupLayout, gridColumns } = useSettingsStore();
  const { scrollTarget, setSaveAllOpen } = useUIStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  // While a programmatic scroll runs, the scroll spy must not overwrite the
  // category the user just picked.
  const spyLockedUntil = useRef(0);

  const categories = activeProject?.categories ?? [];
  const projectHasGroups = categories.some(c => c.groups.length > 0);

  const scrollToCategory = useCallback((categoryId: string, behavior: ScrollBehavior = "smooth", onlyIfHidden = false) => {
    const container = scrollRef.current;
    // Category ids are uuids, but look the section up without building a
    // selector from data anyway.
    const section = container
      ? [...container.querySelectorAll<HTMLElement>("[data-category-id]")].find(el => el.dataset.categoryId === categoryId)
      : undefined;
    if (!container || !section) return;
    if (onlyIfHidden) {
      const headerHeight = 48; // h-12 section header
      const visible =
        section.offsetTop >= container.scrollTop &&
        section.offsetTop + headerHeight <= container.scrollTop + container.clientHeight;
      if (visible) {
        // No scroll happens, so the section at the top stays the current one
        // (TASK-23): the breadcrumb and save target follow what is pinned at
        // the top, not the just-created section further down.
        const top = sectionAtTop(container);
        if (top && top !== useSavedSpacesStore.getState().activeCategoryId) useSavedSpacesStore.getState().setActiveCategory(top);
        return;
      }
    }
    spyLockedUntil.current = Date.now() + 900;
    // The scroll container is `relative`, so offsetTop is already relative to it.
    container.scrollTo({ top: section.offsetTop, behavior });
  }, []);

  // Sidebar / breadcrumb asked for a section.
  useEffect(() => {
    if (scrollTarget) scrollToCategory(scrollTarget.categoryId, "smooth", scrollTarget.mode === "ifNeeded");
  }, [scrollTarget, scrollToCategory]);

  // Opening a project starts at its current section (top for the first one).
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const current = useSavedSpacesStore.getState().activeCategoryId;
    if (!current || categories[0]?.id === current) { container.scrollTop = 0; return; }
    scrollToCategory(current, "auto");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject?.id]);

  // Scroll spy: the section at the top of the viewport is the current
  // category (sidebar highlight, breadcrumb, default save destination).
  const handleScroll = () => {
    const container = scrollRef.current;
    if (!container) return;
    if (Date.now() < spyLockedUntil.current) return;
    const current = sectionAtTop(container);
    if (current && current !== useSavedSpacesStore.getState().activeCategoryId) setActiveCategory(current);
  };


  let body: React.ReactNode;
  if (!activeSpace) {
    body = <LevelEmptyState icon={<SpaceAvatar size={24} />} title="Pick a space" body="Spaces keep your tabs apart, like Work and Personal. Pick one on the left." />;
  } else if (!activeProject) {
    body = (
      <LevelEmptyState
        icon={<ProjectIcon className="h-6 w-6" />}
        title={`${activeSpace.name} has no projects yet`}
        body="A project is one thing you work on, like a client, a course or a trip. Each project gets its own page."
        action={
          <InlineCreate
            label="New project"
            placeholder="Project name"
            inputLabel="New project name"
            onCommit={name => {
              const id = uuidv7();
              addSavedProject(activeSpace.id, { id, name, categories: [], order: activeSpace.projects.length });
              if (!useSavedSpacesStore.getState().expandedProjectIds.includes(id)) toggleExpandedProject(id);
              setActiveProject(id);
            }}
          />
        }
      />
    );
  } else if (categories.length === 0) {
    body = (
      <LevelEmptyState
        icon={<CategoryIcon className="h-6 w-6" />}
        title={`${activeProject.name} has no categories yet`}
        body="Categories split a project into parts, like Research, Design and Admin. Groups of saved tabs live inside a category."
        action={
          <InlineCreate
            key={activeProject.id}
            label="New category"
            placeholder="Category name"
            inputLabel="New category name"
            onCommit={name => {
              const id = uuidv7();
              addSavedCategory(activeSpace.id, activeProject.id, { id, name, groups: [], order: 0 });
              setActiveCategory(id);
            }}
          />
        }
      />
    );
  } else {
    body = (
      <div ref={scrollRef} onScroll={handleScroll} className="relative flex-1 overflow-y-auto content-panel-scroll">
        {categories.map((category, i) => (
          <CategorySection
            key={category.id}
            space={activeSpace}
            project={activeProject}
            category={category}
            layout={groupLayout}
            gridColumns={gridColumns}
            isCurrent={category.id === activeCategory?.id}
            isFirst={i === 0}
            isLast={i === categories.length - 1}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden min-h-0">
      {/* Location header */}
      <div className="flex justify-between items-center gap-3 h-14 px-6 border-b border-black-800 shrink-0">
        <Breadcrumb
          space={activeSpace}
          project={activeProject}
          category={activeCategory}
          onProject={() => { if (categories[0]) { setActiveCategory(categories[0].id); scrollToCategory(categories[0].id); } }}
          onCategory={() => { if (activeCategory) scrollToCategory(activeCategory.id); }}
        />
        <div className="flex items-center gap-2 shrink-0">
          {projectHasGroups && (
            <div className="flex items-center bg-white/[0.05] rounded-md p-0.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="List view"
                    aria-pressed={groupLayout === 'list'}
                    onClick={() => setGroupLayout('list')}
                    className={`p-1 rounded transition-colors ${groupLayout === 'list' ? 'bg-white/10 text-fg' : 'text-fg-subtle hover:text-fg-muted'}`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                    </svg>
                  </button>
                </TooltipTrigger>
                <TooltipContent>List view</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="Grid view"
                    aria-pressed={groupLayout === 'grid'}
                    onClick={() => setGroupLayout('grid')}
                    className={`p-1 rounded transition-colors ${groupLayout === 'grid' ? 'bg-white/10 text-fg' : 'text-fg-subtle hover:text-fg-muted'}`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
                    </svg>
                  </button>
                </TooltipTrigger>
                <TooltipContent>Grid view</TooltipContent>
              </Tooltip>
            </div>
          )}
          {activeCategory && (
            <ShortcutTooltip label="Save all tabs" shortcut="Mod+Shift+S" side="left">
              <Button variant="ghost" size="sm" onClick={() => setSaveAllOpen(true)}>Save all tabs</Button>
            </ShortcutTooltip>
          )}
        </div>
      </div>

      {body}
    </div>
  )
}
