import { useActiveCategory, useActiveSpace, useActiveProject, useSavedSpacesStore } from "~src/store/useSavedSpacesStore";
import type { SavedCategory, SavedGroup, SavedProject, SavedSpace } from "~src/types";
import { TabGroup } from "../TabGroup";
import { Tooltip, TooltipTrigger, TooltipContent } from "~src/components/ui/tooltip";
import { Button } from "~src/components/ui/button";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { DragHandleIcon } from "../icons/DragHandleIcon";
import { useRef, useCallback, useEffect } from "react";
import { v7 as uuidv7 } from "uuid";
import { useSettingsStore, type GroupLayout } from "~src/store/useSettingsStore";
import { useUIStore } from "~src/store/useUIStore";
import { saveTabsAsGroup, defaultSavedGroupName } from "~src/services/saveTabsAsGroup";
import { NEW_GROUP_NAME } from "~src/services/resolveSaveTarget";
import type { GroupLocation } from "~src/services/dragDrop";
import { CategoryIcon, ProjectIcon, SpaceAvatar } from "~src/components/levelIcons";

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
      <div className="absolute top-5 left-5 z-10 opacity-0 group-hover/sortable:opacity-30 hover:!opacity-80 transition-opacity cursor-grab active:cursor-grabbing" {...attributes} {...listeners}>
        <DragHandleIcon className="w-4 h-4 text-white/50" />
      </div>
      <TabGroup group={group} location={location} layout={layout} gridColumns={gridColumns} />
    </div>
  );
}

/** Empty states name the level and say what it is for, once, where it is empty. */
function LevelEmptyState({ icon, title, body, action }: {
  icon: React.ReactNode; title: string; body: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex-1 flex items-center justify-center p-12">
      <div className="flex flex-col items-center gap-5 max-w-sm text-center">
        <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-center text-white/50">
          {icon}
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="text-white/80 font-sans text-sm font-medium">{title}</h3>
          <p className="text-white/55 font-sans text-xs leading-relaxed">{body}</p>
        </div>
        {action}
      </div>
    </div>
  );
}

/** Drop zone for a category that has no groups yet (tabs or whole groups). */
function EmptySectionDrop({ location, onNewGroup }: { location: GroupLocation; onNewGroup: () => void }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `section-drop:${location.spaceId}:${location.projectId}:${location.categoryId}`,
  });
  return (
    <div
      ref={setNodeRef}
      className={`flex items-center justify-between gap-3 px-4 py-2 rounded-lg border border-dashed transition-colors ${isOver ? '' : 'border-white/[0.12]'}`}
      style={isOver ? { borderColor: 'var(--accent)', backgroundColor: 'var(--accent-subtle)' } : undefined}
    >
      <span className={`font-sans text-xs ${isOver ? '' : 'text-white/55'}`} style={isOver ? { color: 'var(--accent)' } : undefined}>
        {isOver ? 'Drop here' : 'Empty — drag tabs or groups here.'}
      </span>
      <Button variant="ghost" size="sm" onClick={onNewGroup} className={isOver ? 'invisible' : ''}>+ New group</Button>
    </div>
  );
}

function CategorySection({ space, project, category, layout, gridColumns, isCurrent, isLast }: {
  space: SavedSpace; project: SavedProject; category: SavedCategory;
  layout: GroupLayout; gridColumns: number; isCurrent: boolean; isLast: boolean;
}) {
  const { addSavedGroup, setActiveCategory } = useSavedSpacesStore();
  const location: GroupLocation = { spaceId: space.id, projectId: project.id, categoryId: category.id };
  const groups = [...category.groups].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const newGroup = () => {
    setActiveCategory(category.id);
    addSavedGroup(space.id, project.id, category.id, {
      id: uuidv7(), name: NEW_GROUP_NAME, tabs: [], order: category.groups.length,
    });
  };

  return (
    // The last section is at least one viewport tall, so jumping to it from the
    // sidebar can bring its header to the top like every other section.
    <section data-category-id={category.id} aria-labelledby={`section-${category.id}`} className={`pb-2 ${isLast ? 'min-h-full' : ''}`}>
      <div className="sticky top-0 z-20 bg-black-900 border-b border-black-800 h-11 px-6 flex items-center justify-between gap-3">
        <h3 id={`section-${category.id}`} className={`flex items-center gap-2 min-w-0 font-sans text-sm ${isCurrent ? 'text-white/90' : 'text-white/70'}`}>
          <CategoryIcon className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate font-medium">{category.name}</span>
          <span className="text-white/45 text-xs font-normal shrink-0">
            {groups.length} group{groups.length !== 1 ? 's' : ''}
          </span>
        </h3>
        {groups.length > 0 && (
          <Button variant="ghost" size="sm" onClick={newGroup} aria-label={`New group in ${category.name}`}>+ New group</Button>
        )}
      </div>
      {groups.length > 0 ? (
        <SortableContext items={groups.map(g => g.id)} strategy={verticalListSortingStrategy}>
          {groups.map((group) => (
            <SortableGroup key={group.id} group={group} location={location} layout={layout} gridColumns={gridColumns} />
          ))}
        </SortableContext>
      ) : (
        <div className="px-6 pt-3 pb-2">
          <EmptySectionDrop location={location} onNewGroup={newGroup} />
        </div>
      )}
    </section>
  );
}

function Breadcrumb({ space, project, category, onProject, onCategory }: {
  space?: SavedSpace; project?: SavedProject; category?: SavedCategory;
  onProject: () => void; onCategory: () => void;
}) {
  const sep = <span aria-hidden className="text-white/35">›</span>;
  return (
    <nav aria-label="Location" className="flex items-center gap-1.5 min-w-0 font-sans text-sm">
      <span className="flex items-center gap-1.5 min-w-0 text-white/60">
        <SpaceAvatar space={space} />
        <span className="truncate max-w-[10rem]">{space?.name ?? 'No space'}</span>
      </span>
      {project && (
        <>
          {sep}
          <button type="button" onClick={onProject}
            className="flex items-center gap-1.5 min-w-0 rounded px-1 -mx-1 text-white/80 hover:text-white outline-none focus-visible:ring-1 focus-visible:ring-ring">
            <ProjectIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate max-w-[14rem] font-medium">{project.name}</span>
          </button>
        </>
      )}
      {project && category && (
        <>
          {sep}
          <button type="button" onClick={onCategory} aria-current="location"
            className="flex items-center gap-1.5 min-w-0 rounded px-1 -mx-1 text-white/60 hover:text-white/90 outline-none focus-visible:ring-1 focus-visible:ring-ring">
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
  const { setActiveCategory } = useSavedSpacesStore();
  const { groupLayout, setGroupLayout, gridColumns } = useSettingsStore();
  const { startCreate, scrollTarget } = useUIStore();
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
      const headerHeight = 44;
      const visible =
        section.offsetTop >= container.scrollTop &&
        section.offsetTop + headerHeight <= container.scrollTop + container.clientHeight;
      if (visible) return;
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
    if (!container || Date.now() < spyLockedUntil.current) return;
    const sections = container.querySelectorAll<HTMLElement>("[data-category-id]");
    const top = container.scrollTop + 48;
    let current: string | null = null;
    sections.forEach(section => {
      if (section.offsetTop <= top) current = section.dataset.categoryId ?? null;
    });
    if (current && current !== useSavedSpacesStore.getState().activeCategoryId) setActiveCategory(current);
  };

  const handleSaveAllTabs = useCallback(async () => {
    if (!activeSpace || !activeProject || !activeCategory) return;
    const windows = await chrome.windows.getAll({ populate: true });
    const allTabs = windows.flatMap((w) => w.tabs ?? []);
    await saveTabsAsGroup({
      target: { spaceId: activeSpace.id, projectId: activeProject.id, categoryId: activeCategory.id },
      name: defaultSavedGroupName(),
      tabs: allTabs,
    });
    scrollToCategory(activeCategory.id);
  }, [activeSpace, activeProject, activeCategory, scrollToCategory]);

  let body: React.ReactNode;
  if (!activeSpace) {
    body = <LevelEmptyState icon={<SpaceAvatar size={24} />} title="Pick a space" body="Spaces are separate worlds for your tabs — e.g. Work and Personal. Pick one on the left." />;
  } else if (!activeProject) {
    body = (
      <LevelEmptyState
        icon={<ProjectIcon className="h-6 w-6" />}
        title={`${activeSpace.name} has no projects yet`}
        body="A project is one thing you work on — a client, a course, a trip. Each project gets its own page."
        action={<Button variant="default" size="sm" onClick={() => startCreate({ kind: "project", spaceId: activeSpace.id })}>New project</Button>}
      />
    );
  } else if (categories.length === 0) {
    body = (
      <LevelEmptyState
        icon={<CategoryIcon className="h-6 w-6" />}
        title={`Add a category to ${activeProject.name}`}
        body="Categories split a project into parts — e.g. Research, Design, Admin. Groups of saved tabs live inside a category."
        action={<Button variant="default" size="sm" onClick={() => startCreate({ kind: "category", spaceId: activeSpace.id, projectId: activeProject.id })}>Add category</Button>}
      />
    );
  } else {
    body = (
      <div ref={scrollRef} onScroll={handleScroll} className="relative flex-1 overflow-y-auto content-panel-scroll">
        {!projectHasGroups && (
          <p className="px-6 pt-4 pb-1 text-white/55 font-sans text-xs leading-relaxed max-w-md">
            Save tabs by dragging them from Opened Tabs, saving a whole window there, or using “Save all tabs” above.
          </p>
        )}
        {categories.map((category, i) => (
          <CategorySection
            key={category.id}
            space={activeSpace}
            project={activeProject}
            category={category}
            layout={groupLayout}
            gridColumns={gridColumns}
            isCurrent={category.id === activeCategory?.id}
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
                    className={`p-1 rounded transition-colors ${groupLayout === 'list' ? 'bg-white/10 text-white/80' : 'text-white/50 hover:text-white/70'}`}
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
                    className={`p-1 rounded transition-colors ${groupLayout === 'grid' ? 'bg-white/10 text-white/80' : 'text-white/50 hover:text-white/70'}`}
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
            <Button variant="ghost" size="sm" onClick={handleSaveAllTabs} title={`Save all open tabs into ${activeCategory.name}`}>Save all tabs</Button>
          )}
        </div>
      </div>

      {body}
    </div>
  )
}
