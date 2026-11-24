import { useState, useEffect, useRef } from 'react';
import { PANEL_HEADER, PANEL_TITLE, PANEL_LIST, PANEL_ROW, PANEL_ROW_END, PanelFooter, AppVersion } from "./panelChrome";
import { TreeRowButton, TREE_ROW_FOCUS, DENSITY_ROW_PY } from "../ui/tree-row-button";
import { ChevronRight, GripVertical } from "lucide-react"
import { Icon } from "~src/components/ui/icon"
import { cn } from "~src/lib/utils"
import { commitOnBlur } from "~src/lib/inlineEdit";
import { useDndContext, useDraggable, useDroppable } from "@dnd-kit/core";
import { categoryDragId, parseContainerDrag, projectDragId } from "~src/services/dragDrop";
import { inPreviewOrder, useContainerPreview } from "~src/store/useContainerPreview";
import { useDropIndicator } from "~src/store/useDropIndicator";
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore";
import { v7 as uuidv7 } from "uuid";
import { showUndoToast } from "~src/components/ui/sonner";
import { ConfirmDialog } from "~src/components/ui/confirm-dialog";
import { ActionSlot, RowActions } from "~src/components/ui/row-actions";
import { navigate } from "~src/lib/route";
import { SPACES_ROUTE } from "~src/components/settings/SpacesTab";
import { IconButton, IconTooltip } from "~src/components/ui/button";
import { Input, INLINE_CREATE_HINT, inlineEditFrame } from "~src/components/ui/input"
import type { SavedProject, SavedCategory } from "~src/types";
import { useUIStore, type CreateRequest, type ScrollMode } from "~src/store/useUIStore";
import { ProjectIcon, CategoryIcon } from "~src/components/levelIcons";
import { Plus } from "lucide-react";
import { Kbd, ShortcutTooltip } from "~src/components/ui/kbd";
import { isUnsortedGroup } from "~src/lib/defaultPath";
import { MoveContainerDialog } from "~src/components/MoveContainerDialog";
import { describeContainerTarget, moveCategoryTo, moveProjectTo, shiftCategory, shiftProject, type ContainerTarget } from "~src/services/moveTo";
import { CreateSlot } from "~src/components/ui/create-slot";

/**
 * "New project…" slot at the end of the project list. It creates rather than
 * selects, so it differs from rows by shape — the dashed "add here" outline
 * the rail's add-space button already uses — with muted text and an ellipsis,
 * not by colour. It starts where project rows start (the chevron column) and
 * its + sits in the project icon column (1px border + 23px = 24px). It is
 * as tall as a project row (1px border + 5px = the rows' 6px padding), so
 * the name row that replaces it doesn't move anything. New
 * categories have one affordance of their own: the + on each project row.
 */
function NewProjectSlot({ onClick }: { onClick: () => void }) {
  return (
    // No top margin of its own: the last project block's mb-1 spaces it like a
    // row, so the slot, the name row that replaces it and the project it
    // creates all sit at the same y (mt-3 made the field jump 8px).
    // The tree rows' box (mx-2): the slot's edges are the rows' edges; its + stays 28px in.
    <div className="mx-2">
      <ShortcutTooltip label="New project" shortcut="Shift+N">
      <CreateSlot size="sidebar" onClick={onClick}>New project</CreateSlot>
      </ShortcutTooltip>
    </div>
  );
}

/**
 * Inline "name it first" row: nothing is written until the user commits a
 * name, so there are no placeholder "New Project"/"New Category" nodes.
 * Enter commits, Escape (or leaving it empty) cancels.
 */
function CreateRow({ kind, onCommit, onCancel }: {
  kind: CreateRequest["kind"];
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  const done = useRef(false);
  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    const name = value.trim();
    if (commit && name) onCommit(name); else onCancel();
  };
  const project = kind === "project";
  // The name sits in the label column and the row is as tall as the
  // rows around it. A new project replaces the "New project…" slot, so its
  // frame IS the slot's box (mx-2, the tree rows' box; icon 28px in, the density row padding =
  // the slot's 1px border + its padding): the dashed edge turns solid in place. A new
  // category is inserted by the project's +, so its frame is the category row's box
  // (mx-2, pl-7 + the density row padding), the same shape as a selected category.
  return (
    <div className={project ? "mx-2" : `flex items-center gap-1 mx-2 ${PANEL_ROW_END} text-fg-muted ${inlineEditFrame}`}>
      <div className={`flex-1 min-w-0 flex items-center gap-2 text-item ${project ? `pl-7 pr-2 ${DENSITY_ROW_PY} font-medium text-fg-muted ${inlineEditFrame}` : `pl-7 pr-1 ${DENSITY_ROW_PY}`}`}>
        {project
          ? <ProjectIcon size="sm" className="text-fg-subtle" />
          : <CategoryIcon size="xs" />}
        <Input
          variant="inline"
          autoFocus
          aria-label={project ? "New project name" : "New category name"}
          aria-description={INLINE_CREATE_HINT}
          placeholder={project ? "Project name" : "Category name"}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") { e.preventDefault(); finish(true); }
            if (e.key === "Escape") { e.preventDefault(); finish(false); }
          }}
          onBlur={commitOnBlur(() => finish(true))}
          className="flex-1"
        />
      </div>
    </div>
  );
}

export function LeftPanel() {
  // A project or category dragged within its parent: the list shows the new order,
  // the dragged row dimmed in its slot (as Opened Tabs does).
  const containerPreview = useContainerPreview((s) => s.preview);
  const activeDrag = useDndContext().active;
  const dragging = typeof activeDrag?.id === "string" ? parseContainerDrag(activeDrag.id) : null;
  const {
    savedSpaces, activeSpaceId, activeProjectId, activeCategoryId,
    expandedProjectIds, toggleExpandedProject,
    setActiveProject, setActiveCategory,
    addSavedProject, removeSavedProject,
    addSavedCategory, removeSavedCategory,
    updateSavedProject, updateSavedCategory, updateSavedSpace,
  } = useSavedSpacesStore();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameRef = useRef<HTMLInputElement>(null);

  const currentSpace = savedSpaces.find(s => s.id === activeSpaceId);

  // "Move to…" for a project or a category, with Undo like a delete.
  const [moving, setMoving] = useState<
    | { kind: "project"; project: SavedProject }
    | { kind: "category"; project: SavedProject; category: SavedCategory }
    | null
  >(null);
  const confirmMove = (target: ContainerTarget) => {
    if (!moving || !currentSpace) return;
    const undo = moving.kind === "project"
      ? moveProjectTo(currentSpace.id, moving.project.id, target.spaceId)
      : target.projectId ? moveCategoryTo({ spaceId: currentSpace.id, projectId: moving.project.id }, moving.category.id, { spaceId: target.spaceId, projectId: target.projectId }) : null;
    const name = moving.kind === "project" ? moving.project.name : moving.category.name;
    if (undo) showUndoToast(`Moved “${name}” to ${describeContainerTarget(target)}`, undo);
  };

  useEffect(() => {
    if (renamingId && renameRef.current) {
      renameRef.current.focus();
      renameRef.current.select();
    }
  }, [renamingId]);

  const startRename = (id: string, currentName: string) => {
    setRenameValue(currentName);
    setRenamingId(id);
  };

  const submitRename = () => {
    if (!renamingId || !renameValue.trim() || !currentSpace) { setRenamingId(null); return; }
    const project = currentSpace.projects.find(p => p.id === renamingId);
    if (renamingId === currentSpace.id) {
      updateSavedSpace({ ...currentSpace, name: renameValue.trim() });
    } else if (project) {
      updateSavedProject(currentSpace.id, { ...project, name: renameValue.trim() });
    } else {
      for (const p of currentSpace.projects) {
        const cat = p.categories.find(c => c.id === renamingId);
        if (cat) { updateSavedCategory(currentSpace.id, p.id, { ...cat, name: renameValue.trim() }); break; }
      }
    }
    setRenamingId(null);
  };

  const { creating, startCreate, endCreate, requestScrollToCategory } = useUIStore();

  // A project is a folder of categories (it has no page of its own), so its
  // name toggles like the chevron: a collapsed project opens and shows its
  // categories; an open one closes and the content panel stays as it is.
  const toggleProject = (projectId: string) => {
    if (expandedProjectIds.includes(projectId)) { toggleExpandedProject(projectId); return; }
    if (activeProjectId !== projectId) setActiveProject(projectId);
    toggleExpandedProject(projectId);
  };

  const selectCategory = (projectId: string, categoryId: string, scrollMode: ScrollMode = "top") => {
    if (activeProjectId !== projectId) setActiveProject(projectId);
    setActiveCategory(categoryId);
    requestScrollToCategory(categoryId, scrollMode);
  };

  const commitProject = (spaceId: string, name: string, then?: () => void) => {
    const space = savedSpaces.find(s => s.id === spaceId);
    const id = uuidv7();
    addSavedProject(spaceId, { id, name, categories: [], order: space?.projects.length ?? 0 });
    if (!expandedProjectIds.includes(id)) toggleExpandedProject(id);
    setActiveProject(id);
    // One name per action: no chained "now name its category" prompt. Saving
    // into an empty project still works (default category + Unsorted).
    endCreate();
    then?.();
  };

  const commitCategory = (spaceId: string, projectId: string, name: string, then?: () => void) => {
    const project = savedSpaces.find(s => s.id === spaceId)?.projects.find(p => p.id === projectId);
    const id = uuidv7();
    addSavedCategory(spaceId, projectId, { id, name, groups: [], order: project?.categories.length ?? 0 });
    endCreate();
    // Only scroll if the new section is off-screen; don't yank the page away.
    selectCategory(projectId, id, "ifNeeded");
    then?.();
  };

  const handleAddCategory = (projectId: string) => {
    if (!currentSpace) return;
    if (!expandedProjectIds.includes(projectId)) toggleExpandedProject(projectId);
    startCreate({ kind: "category", spaceId: currentSpace.id, projectId });
  };

  const [confirmDelete, setConfirmDelete] = useState<{ kind: string; name: string; run: () => void } | null>(null);

  const requestDeleteProject = (project: SavedProject) => {
    if (!currentSpace) return;
    setConfirmDelete({
      kind: "project",
      name: project.name,
      run: () => {
        removeSavedProject(currentSpace.id, project);
        showUndoToast(`Deleted "${project.name}"`, () => addSavedProject(currentSpace.id, project));
      },
    });
  };

  const requestDeleteCategory = (project: SavedProject, category: SavedCategory) => {
    if (!currentSpace) return;
    setConfirmDelete({
      kind: "category",
      name: category.name,
      run: () => {
        removeSavedCategory(currentSpace.id, project.id, category);
        showUndoToast(`Deleted "${category.name}"`, () => addSavedCategory(currentSpace.id, project.id, category));
      },
    });
  };

  /**
   * Arrow keys in the project/category tree, the usual tree pattern:
   * Up/Down move between rows, Right expands a project (or enters its first
   * category), Left collapses it (or goes from a category back to its
   * project), Home/End jump to the first/last row. Enter on a project
   * toggles it, like a click on its name.
   */
  const handleTreeKeys = (e: React.KeyboardEvent<HTMLElement>) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>("[data-tree-row]");
    if (!row || !["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) return;
    const rows = [...e.currentTarget.querySelectorAll<HTMLElement>("[data-tree-row]")];
    const i = rows.indexOf(row);
    const projectId = row.dataset.projectId!;
    const projectRow = rows.find(r => r.dataset.treeRow === "project" && r.dataset.projectId === projectId);
    let next: HTMLElement | undefined;
    if (e.key === "ArrowDown") next = rows[i + 1];
    else if (e.key === "ArrowUp") next = rows[i - 1];
    else if (e.key === "Home") next = rows[0];
    else if (e.key === "End") next = rows[rows.length - 1];
    else if (row.dataset.treeRow === "project") {
      const expanded = expandedProjectIds.includes(projectId);
      if (e.key === "ArrowRight") {
        if (!expanded) toggleExpandedProject(projectId);
        else if (rows[i + 1]?.dataset.treeRow === "category") next = rows[i + 1];
      } else if (expanded) toggleExpandedProject(projectId);
    } else if (e.key === "ArrowLeft") next = projectRow;
    e.preventDefault();
    next?.focus();
  };

  return (
    <aside aria-label="Space" className="w-64 h-full flex flex-col bg-black-900 relative">
      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}
        title={`Delete ${confirmDelete?.kind ?? ""}?`}
        message={
          <>
            This permanently removes <span className="text-fg">{confirmDelete?.name}</span> and everything inside it.
          </>
        }
        confirmLabel={`Delete ${confirmDelete?.kind ?? ""}`.trim()}
        onConfirm={() => confirmDelete?.run()}
      />
      {moving && currentSpace && (
        <MoveContainerDialog
          kind={moving.kind}
          name={moving.kind === "project" ? moving.project.name : moving.category.name}
          current={moving.kind === "project" ? { spaceId: currentSpace.id } : { spaceId: currentSpace.id, projectId: moving.project.id }}
          onConfirm={confirmMove}
          onClose={() => setMoving(null)}
        />
      )}
      {/* The space is this panel's title, where Settings shows
          "Settings": the logo already sits in the rail, the version lives in
          Settings. Its ⋯ is the same "actions for this thing" as every row's;
          deleting a space stays in Settings › Spaces. pr-3 keeps
          the ⋯ in the tree rows' trailing slot column. */}
      <div className={PANEL_HEADER}>
        {currentSpace && renamingId === currentSpace.id ? (
          // The frame's padding is cancelled by an equal negative margin, so the
          // title neither moves nor changes the header's height.
          <div className={`flex flex-1 min-w-0 -ml-2 pl-2 -my-1 py-1 text-2xl ${inlineEditFrame}`}>
            <Input variant="inline" ref={renameRef} type="text" value={renameValue}
              aria-label="Space name"
              placeholder="Space name"
              onChange={e => setRenameValue(e.target.value)} onBlur={submitRename}
              onKeyDown={e => { if (e.key === "Enter") submitRename(); if (e.key === "Escape") setRenamingId(null); }}
              className="flex-1" />
          </div>
        ) : (
          <h1 className={PANEL_TITLE}>{currentSpace?.name || 'No space'}</h1>
        )}
        {currentSpace && (
          <RowActions
            label={`Actions for ${currentSpace.name}`}
            tooltipSide="top"
            items={[
              { label: "Rename", onSelect: () => startRename(currentSpace.id, currentSpace.name), takesFocus: true },
              { label: "Space settings…", onSelect: () => navigate(`${SPACES_ROUTE}/${encodeURIComponent(currentSpace.id)}`) },
            ]}
          />
        )}
      </div>

      {/* Navigation */}
      <nav aria-label="Projects and categories" className={PANEL_LIST} onKeyDown={handleTreeKeys}>
        {currentSpace ? (
          <>
            {inPreviewOrder(currentSpace.projects, "project", containerPreview).map((project, projectIndex) => {
              const isExpanded = expandedProjectIds.includes(project.id);
              const projectDragged = dragging?.kind === "project" && dragging.projectId === project.id;

              return (
                <div key={project.id} className="relative mb-1" style={projectDragged ? { opacity: 0.5 } : undefined}>
                  {/* Project — tree node: chevron toggles, name selects the project page */}
                  <DroppableProjectItem
                    spaceId={currentSpace.id}
                    projectId={project.id}
                  >
                    <div className={`group/proj flex items-center gap-1 ${PANEL_ROW} ${TREE_ROW_FOCUS} ${
                      renamingId === project.id ? `text-fg ${inlineEditFrame}` :
                      activeProjectId === project.id ? 'text-fg' : 'text-fg-muted hover:bg-ink/[0.04]'
                    }`}>
                      <IconButton
                        variant="subtle"
                        size="disclosure"
                        className="shrink-0"
                        onClick={() => toggleExpandedProject(project.id)}
                        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${project.name}`}
                        aria-expanded={isExpanded}
                      >
                        <Icon icon={ChevronRight} size="xs" className={cn("transition-transform", isExpanded && "rotate-90")} />
                      </IconButton>

                      {renamingId === project.id ? (
                        // Same label box as the name button below, icon kept, so the text doesn't move.
                        <div className={`flex-1 min-w-0 flex items-center gap-2 ${DENSITY_ROW_PY} text-item font-medium`}>
                          <ProjectIcon size="sm" className="text-fg-subtle" />
                          <Input variant="inline" ref={renameRef} type="text" value={renameValue}
                            aria-label="Project name"
                            placeholder="Project name"
                            onChange={e => setRenameValue(e.target.value)} onBlur={submitRename}
                            onKeyDown={e => { if (e.key === "Enter") submitRename(); if (e.key === "Escape") setRenamingId(null); }}
                            className="flex-1" />
                        </div>
                      ) : (
                        <TreeRowButton
                          level="project"
                          data-tree-row="project"
                          data-project-id={project.id}
                          onClick={() => toggleProject(project.id)}
                          aria-expanded={isExpanded}
                          aria-current={activeProjectId === project.id ? "page" : undefined}
                          className="flex-1 min-w-0"
                          icon={
                            <IconDragHandle id={projectDragId(currentSpace.id, project.id)} label={project.name}
                              reveal="group-hover/proj:opacity-100" conceal="group-hover/proj:opacity-0">
                              <ProjectIcon size="sm" className="text-fg-subtle" />
                            </IconDragHandle>
                          }
                        >
                          {project.name}
                        </TreeRowButton>
                      )}

                      {/* A project is a header row: its primary action
                          ("+" new category) and its ⋯ are always visible, ⋯
                          outermost in the slot column. */}
                      <ActionSlot>
                        <IconButton
                          aria-label={`New category in ${project.name}`}
                          tooltip="New category"
                          tooltipSide="top"
                          onClick={e => { e.stopPropagation(); handleAddCategory(project.id); }}
                        >
                          <Icon icon={Plus} size="sm" />
                        </IconButton>
                      </ActionSlot>
                      <RowActions
                        label={`Actions for ${project.name}`}
                        tooltipSide="right"
                        items={[
                          { label: "Rename", onSelect: () => startRename(project.id, project.name), takesFocus: true },
                          { label: "Move to…", onSelect: () => setMoving({ kind: "project", project }) },
                          // The keyboard path for order, as Settings › Spaces has up/down.
                          { label: "Move up", onSelect: () => shiftProject(currentSpace.id, project.id, -1), disabled: projectIndex === 0 },
                          { label: "Move down", onSelect: () => shiftProject(currentSpace.id, project.id, 1), disabled: projectIndex === currentSpace.projects.length - 1 },
                          { label: "Delete", onSelect: () => requestDeleteProject(project), danger: true, separatorBefore: true },
                        ]}
                      />
                    </div>
                  </DroppableProjectItem>

                  {/* Categories */}
                  {isExpanded && (
                    <div className="mt-0.5">
                      {inPreviewOrder(project.categories, "category", containerPreview).map((category, categoryIndex) => {
                        const isActive = activeProjectId === project.id && activeCategoryId === category.id;
                        const categoryDragged = dragging?.kind === "category" && dragging.categoryId === category.id;
                        return (
                          <DroppableCategoryItem
                            key={category.id}
                            spaceId={currentSpace.id}
                            projectId={project.id}
                            categoryId={category.id}
                            dimmed={categoryDragged}
                          >
                            {renamingId === category.id ? (
                              // The category row's own box (mx-2 + pl-7 + density row padding), so the name stays put.
                              <div className={`flex items-center gap-1 mx-2 ${PANEL_ROW_END} text-fg ${inlineEditFrame}`}>
                                <div className={`flex-1 min-w-0 flex items-center gap-2 pl-7 pr-1 ${DENSITY_ROW_PY} text-item`}>
                                  <CategoryIcon size="xs" />
                                  <Input variant="inline" ref={renameRef} type="text" value={renameValue}
                                    aria-label="Category name"
                                    placeholder="Category name"
                                    onChange={e => setRenameValue(e.target.value)} onBlur={submitRename}
                                    onKeyDown={e => { if (e.key === "Enter") submitRename(); if (e.key === "Escape") setRenamingId(null); }}
                                    className="flex-1" />
                                </div>
                              </div>
                            ) : (
                              <div
                                className={`group/cat flex items-center gap-1 mx-2 ${PANEL_ROW_END} rounded-md transition-colors ${TREE_ROW_FOCUS} ${
                                  isActive ? 'text-fg' : 'text-fg-muted hover:text-fg hover:bg-ink/[0.04]'
                                }`}
                                style={isActive ? { backgroundColor: 'var(--accent-subtle)' } : undefined}
                              >
                              <TreeRowButton
                                level="category"
                                data-tree-row="category"
                                data-project-id={project.id}
                                aria-current={isActive ? "location" : undefined}
                                className="flex-1 min-w-0"
                                onClick={() => selectCategory(project.id, category.id)}
                                icon={
                                  <IconDragHandle id={categoryDragId(currentSpace.id, project.id, category.id)} label={category.name}
                                    reveal="group-hover/cat:opacity-100" conceal="group-hover/cat:opacity-0">
                                    <CategoryIcon size="xs" />
                                  </IconDragHandle>
                                }
                              >
                                {category.name}
                              </TreeRowButton>
                              <RowActions
                                label={`Actions for ${category.name}`}
                                tooltipSide="right"
                                reveal="opacity-0 group-hover/cat:opacity-100 group-focus-within/cat:opacity-100"
                                conceal="group-hover/cat:opacity-0 group-focus-within/cat:opacity-0"
                                rest={category.groups.some(g => !isUnsortedGroup(g)) ? (
                                  <span className={`text-count font-sans ${isActive ? 'text-fg-muted' : 'text-fg-subtle'}`}>
                                    {category.groups.filter(g => !isUnsortedGroup(g)).length}
                                  </span>
                                ) : undefined}
                                items={[
                                  { label: "Rename", onSelect: () => startRename(category.id, category.name), takesFocus: true },
                                  { label: "Move to…", onSelect: () => setMoving({ kind: "category", project, category }) },
                                  { label: "Move up", onSelect: () => shiftCategory(currentSpace.id, project.id, category.id, -1), disabled: categoryIndex === 0 },
                                  { label: "Move down", onSelect: () => shiftCategory(currentSpace.id, project.id, category.id, 1), disabled: categoryIndex === project.categories.length - 1 },
                                  { label: "Delete", onSelect: () => requestDeleteCategory(project, category), danger: true, separatorBefore: true },
                                ]}
                              />
                              </div>
                            )}
                          </DroppableCategoryItem>
                        );
                      })}

                      {creating?.kind === "category" && creating.projectId === project.id ? (
                        <CreateRow
                          key={`create-category-${project.id}`}
                          kind="category"
                          onCommit={name => commitCategory(currentSpace.id, project.id, name, creating.then)}
                          onCancel={endCreate}
                        />
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}

            {creating?.kind === "project" && creating.spaceId === currentSpace.id ? (
              <CreateRow
                key={`create-project-${currentSpace.id}`}
                kind="project"
                onCommit={name => commitProject(currentSpace.id, name, creating.then)}
                onCancel={endCreate}
              />
            ) : (
              <div>
                <NewProjectSlot onClick={() => startCreate({ kind: "project", spaceId: currentSpace.id })} />
              </div>
            )}
          </>
        ) : savedSpaces.length > 0 ? (
          <div className="text-fg-subtle font-sans text-xs p-8 text-center">Select a space</div>
        ) : null /* No spaces: nothing to select; the workspace offers New space. */}
      </nav>

      <PanelFooter start={<AppVersion />} />

    </aside>
  );
}

/**
 * A project's or category's level icon doubles as its drag handle on hover,
 * as a saved tab's favicon does: no extra gutter, the row keeps its
 * shape. Pointer only and hidden from assistive tech: the keyboard path is the
 * row's ⋯ › Move to…. A plain click on it does nothing (the row's own click
 * would otherwise toggle or open it).
 */
function IconDragHandle({ id, label, reveal, conceal, children }: {
  id: string; label: string; reveal: string; conceal: string; children: React.ReactNode;
}) {
  const { listeners, setNodeRef } = useDraggable({ id });
  return (
    <span className="relative flex shrink-0">
      <span className={`flex transition-opacity ${conceal}`}>{children}</span>
      <IconTooltip content="Drag to move">
        <span
          ref={setNodeRef}
          {...listeners}
          aria-hidden
          data-drag-handle={label}
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
          className={`absolute -inset-1 flex items-center justify-center rounded opacity-0 cursor-grab active:cursor-grabbing transition-opacity ${reveal}`}
        >
          <Icon icon={GripVertical} size="xs" className="text-fg-muted" />
        </span>
      </IconTooltip>
    </span>
  );
}

/** A drop zone's highlight, unless the drop there reorders (then the list shows the new order instead). */
function useZoneHighlight(id: string) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const reorders = useDropIndicator((s) => s.zone === id);
  return { setNodeRef, highlight: isOver && !reorders };
}

function DroppableProjectItem({ spaceId, projectId, children }: {
  spaceId: string; projectId: string; children: React.ReactNode;
}) {
  const { setNodeRef, highlight } = useZoneHighlight(`proj-drop:${spaceId}:${projectId}`);

  return (
    <div ref={setNodeRef} className={`transition-colors rounded ${highlight ? 'ring-1' : ''}`}
      style={highlight ? { backgroundColor: 'var(--accent-subtle)' } : undefined}
    >
      {children}
    </div>
  );
}

function DroppableCategoryItem({ spaceId, projectId, categoryId, dimmed = false, children }: {
  spaceId: string; projectId: string; categoryId: string; dimmed?: boolean; children: React.ReactNode;
}) {
  const zone = `cat-drop:${spaceId}:${projectId}:${categoryId}`;
  const { setNodeRef, highlight } = useZoneHighlight(zone);

  return (
    <div ref={setNodeRef} className={`relative transition-colors rounded-md ${highlight ? 'ring-1' : ''}`}
      style={{ ...(highlight ? { backgroundColor: 'var(--accent-subtle)' } : {}), ...(dimmed ? { opacity: 0.5 } : {}) }}
    >
      {children}
    </div>
  );
}
