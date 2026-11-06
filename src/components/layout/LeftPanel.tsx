import { useState, useEffect, useRef } from 'react';
import { useDroppable } from "@dnd-kit/core";
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore";
import { v7 as uuidv7 } from "uuid";
import config from '../../../package.json';
import { showUndoToast } from "~src/components/ui/sonner";
import { ConfirmDialog } from "~src/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogTitle } from "~src/components/ui/dialog";
import { Tooltip, TooltipTrigger, TooltipContent } from "~src/components/ui/tooltip";
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem } from "~src/components/ui/context-menu";
import { Button, IconButton } from "~src/components/ui/button";
import { Input } from "~src/components/ui/input"
import { Label } from "~src/components/ui/label";
import type { SavedProject, SavedCategory } from "~src/types";
import { useUIStore, type CreateRequest, type ScrollMode } from "~src/store/useUIStore";
import { ProjectIcon, CategoryIcon } from "~src/components/levelIcons";

/**
 * Inline "name it first" row: nothing is written until the user commits a
 * name, so there are no placeholder "New Project"/"New Category" nodes.
 * Enter commits, Escape (or leaving it empty) cancels.
 */
function CreateRow({ kind, onCommit, onCancel, indent }: {
  kind: CreateRequest["kind"];
  onCommit: (name: string) => void;
  onCancel: () => void;
  indent?: boolean;
}) {
  const [value, setValue] = useState("");
  const done = useRef(false);
  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    const name = value.trim();
    if (commit && name) onCommit(name); else onCancel();
  };
  const Icon = kind === "project" ? ProjectIcon : CategoryIcon;
  return (
    <div className={`flex flex-col gap-1 ${indent ? "mx-2 pl-4 pr-2" : "px-3"} py-1`}>
      <div className="flex items-center gap-2 text-white/60">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <Input
          variant="inline"
          autoFocus
          aria-label={kind === "project" ? "New project name" : "New category name"}
          placeholder={kind === "project" ? "Project name" : "Category name"}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") { e.preventDefault(); finish(true); }
            if (e.key === "Escape") { e.preventDefault(); finish(false); }
          }}
          onBlur={() => finish(true)}
          className="flex-1 text-[13px] min-w-0"
        />
      </div>
      <span className="pl-5 text-[11px] text-white/50 font-sans">Enter to create · Esc to cancel</span>
    </div>
  );
}

const SPACE_COLORS = [
  "", "#2274F0", "#8b5cf6", "#ec4899", "#ef4444",
  "#f97316", "#eab308", "#22c55e", "#06b6d4",
];

function SpaceSettings({ onClose }: { onClose: () => void }) {
  const { savedSpaces, activeSpaceId, updateSavedSpace } = useSavedSpacesStore();
  const currentSpace = savedSpaces.find(s => s.id === activeSpaceId);
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(currentSpace?.name ?? "");
  const [abbreviation, setAbbreviation] = useState(currentSpace?.abbreviation ?? "");
  const [color, setColor] = useState(currentSpace?.color ?? "");

  useEffect(() => { nameRef.current?.focus(); }, []);

  if (!currentSpace) return null;

  const handleSave = () => {
    updateSavedSpace({
      ...currentSpace,
      name: name.trim() || currentSpace.name,
      abbreviation: abbreviation.trim() || undefined,
      color: color || undefined,
    });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="w-80 p-5 flex flex-col gap-4">
        <DialogTitle className="text-white/80 font-sans text-sm font-medium">Space Settings</DialogTitle>
        <div className="flex flex-col gap-1">
          <Label>Name</Label>
          <Input ref={nameRef} type="text" value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") onClose(); }}
            className="w-full" />
        </div>
        <div className="flex flex-col gap-1">
          <Label>Abbreviation (max 2)</Label>
          <Input type="text" value={abbreviation} onChange={e => setAbbreviation(e.target.value.slice(0, 2))}
            placeholder={currentSpace.name.slice(0, 2).toUpperCase()}
            onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") onClose(); }}
            className="w-20" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Color</Label>
          <div className="flex gap-2 flex-wrap">
            {SPACE_COLORS.map(c => (
              <button key={c || "default"} onClick={() => setColor(c)}
                className={`w-6 h-6 rounded-full border-2 transition-all ${color === c ? 'border-white/70 scale-110' : 'border-transparent hover:border-white/30'}`}
                style={{ backgroundColor: c || 'rgba(255,255,255,0.15)' }} />
            ))}
          </div>
        </div>
        <Button variant="default" onClick={handleSave} className="mt-1 w-full">Save</Button>
      </DialogContent>
    </Dialog>
  );
}

export function LeftPanel() {
  const {
    savedSpaces, activeSpaceId, activeProjectId, activeCategoryId,
    expandedProjectIds, toggleExpandedProject,
    setActiveProject, setActiveCategory,
    addSavedProject, removeSavedProject,
    addSavedCategory, removeSavedCategory,
    updateSavedProject, updateSavedCategory,
  } = useSavedSpacesStore();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const renameRef = useRef<HTMLInputElement>(null);

  const currentSpace = savedSpaces.find(s => s.id === activeSpaceId);

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
    if (project) {
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

  const selectProject = (projectId: string) => {
    if (activeProjectId !== projectId) setActiveProject(projectId);
    if (!expandedProjectIds.includes(projectId)) toggleExpandedProject(projectId);
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
    // A project is only useful with a category; ask for the first one right
    // away (Esc skips it and leaves the project empty).
    startCreate({ kind: "category", spaceId, projectId: id, then });
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

  return (
    <div className="w-64 h-full flex flex-col bg-black-900 relative">
      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}
        title={`Delete ${confirmDelete?.kind ?? ""}?`}
        message={
          <>
            This permanently removes <span className="text-white/80">{confirmDelete?.name}</span> and everything inside it.
          </>
        }
        confirmLabel="Delete"
        onConfirm={() => confirmDelete?.run()}
      />
      {/* Header */}
      <div className="h-16 p-4 flex items-end gap-2 border-b border-black-800">
        <h1 className="text-white/90 font-sans text-2xl">FlexTab</h1>
        <p className="text-white/50 font-sans text-sm">v{config.version || '0.0.1'}</p>
      </div>

      {/* Space header */}
      <div className="flex items-center justify-between h-14 px-4 border-b border-black-800">
        <div className="flex items-center gap-2.5 min-w-0">
          <h2 className="text-white/70 font-sans text-sm font-medium truncate">{currentSpace?.name || 'No Space'}</h2>
        </div>
        {currentSpace && (
          <Tooltip>
          <TooltipTrigger asChild>
          <IconButton variant="subtle" onClick={() => setShowSettings(!showSettings)}
            className={`shrink-0 ${showSettings ? '!text-white/70' : ''}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
          </IconButton>
          </TooltipTrigger>
          <TooltipContent>Space settings</TooltipContent>
          </Tooltip>
        )}
      </div>

      {showSettings && <SpaceSettings onClose={() => setShowSettings(false)} />}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        {currentSpace ? (
          <>
            {currentSpace.projects.map((project) => {
              const isExpanded = expandedProjectIds.includes(project.id);

              return (
                <div key={project.id} className="mb-1">
                  {/* Project — tree node: chevron toggles, name selects the project page */}
                  <DroppableProjectItem
                    spaceId={currentSpace.id}
                    projectId={project.id}
                  >
                    <ContextMenu>
                    <ContextMenuTrigger asChild>
                    <div className={`group/proj flex items-center gap-1 mx-2 pl-1 pr-1 rounded-md transition-colors ${
                      activeProjectId === project.id ? 'text-white/90' : 'text-white/70 hover:bg-white/[0.04]'
                    }`}>
                      <button
                        type="button"
                        onClick={() => toggleExpandedProject(project.id)}
                        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${project.name}`}
                        aria-expanded={isExpanded}
                        className="h-6 w-5 shrink-0 flex items-center justify-center rounded text-white/50 hover:text-white/80 outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        <svg className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                          fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>

                      {renamingId === project.id ? (
                        <Input variant="inline" ref={renameRef} type="text" value={renameValue}
                          aria-label="Project name"
                          onChange={e => setRenameValue(e.target.value)} onBlur={submitRename}
                          onKeyDown={e => { if (e.key === "Enter") submitRename(); if (e.key === "Escape") setRenamingId(null); }}
                          className="flex-1 text-[13px] min-w-0" />
                      ) : (
                        <button
                          type="button"
                          onClick={() => selectProject(project.id)}
                          aria-current={activeProjectId === project.id ? "page" : undefined}
                          className="flex-1 min-w-0 flex items-center gap-2 py-1.5 text-left rounded outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          <ProjectIcon className="h-3.5 w-3.5 shrink-0 text-white/55" />
                          <span className="flex-1 font-sans text-[13px] font-medium truncate">{project.name}</span>
                        </button>
                      )}

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <IconButton
                            variant="subtle"
                            aria-label={`Add category to ${project.name}`}
                            onClick={e => { e.stopPropagation(); handleAddCategory(project.id); }}
                            className="shrink-0 opacity-0 group-hover/proj:opacity-100 focus-visible:opacity-100"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                            </svg>
                          </IconButton>
                        </TooltipTrigger>
                        <TooltipContent side="right">Add category</TooltipContent>
                      </Tooltip>
                    </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem onSelect={() => startRename(project.id, project.name)}>Rename</ContextMenuItem>
                      <ContextMenuItem className="text-red-400 focus:bg-red-400/10 focus:text-red-400" onSelect={() => requestDeleteProject(project)}>Delete</ContextMenuItem>
                    </ContextMenuContent>
                    </ContextMenu>
                  </DroppableProjectItem>

                  {/* Categories */}
                  {isExpanded && (
                    <div className="mt-0.5">
                      {project.categories.map((category) => {
                        const isActive = activeProjectId === project.id && activeCategoryId === category.id;
                        return (
                          <DroppableCategoryItem
                            key={category.id}
                            spaceId={currentSpace.id}
                            projectId={project.id}
                            categoryId={category.id}
                          >
                            <ContextMenu>
                            <ContextMenuTrigger asChild>
                            {renamingId === category.id ? (
                              <div className="flex items-center gap-2 mx-2 pl-7 pr-2 py-[5px]">
                                <CategoryIcon className="h-3 w-3 shrink-0 text-white/50" />
                                <Input variant="inline" ref={renameRef} type="text" value={renameValue}
                                  aria-label="Category name"
                                  onChange={e => setRenameValue(e.target.value)} onBlur={submitRename}
                                  onKeyDown={e => { if (e.key === "Enter") submitRename(); if (e.key === "Escape") setRenamingId(null); }}
                                  className="flex-1 text-xs min-w-0" />
                              </div>
                            ) : (
                              <button
                                type="button"
                                aria-current={isActive ? "location" : undefined}
                                className={`w-[calc(100%-16px)] flex items-center gap-2 mx-2 pl-7 pr-2 py-[6px] rounded-md text-left transition-colors outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                                  isActive
                                    ? 'text-white/90'
                                    : 'text-white/60 hover:text-white/80 hover:bg-white/[0.04]'
                                }`}
                                style={isActive ? { backgroundColor: 'var(--accent-subtle)' } : undefined}
                                onClick={() => selectCategory(project.id, category.id)}
                              >
                                <CategoryIcon className="h-3 w-3 shrink-0" />
                                <span className="flex-1 font-sans text-[13px] truncate">{category.name}</span>
                                {category.groups.length > 0 && (
                                  <span className={`text-[10px] font-sans shrink-0 ${isActive ? 'text-white/60' : 'text-white/45'}`}>
                                    {category.groups.length}
                                  </span>
                                )}
                              </button>
                            )}
                            </ContextMenuTrigger>
                            <ContextMenuContent>
                              <ContextMenuItem onSelect={() => startRename(category.id, category.name)}>Rename</ContextMenuItem>
                              <ContextMenuItem className="text-red-400 focus:bg-red-400/10 focus:text-red-400" onSelect={() => requestDeleteCategory(project, category)}>Delete</ContextMenuItem>
                            </ContextMenuContent>
                            </ContextMenu>
                          </DroppableCategoryItem>
                        );
                      })}

                      {creating?.kind === "category" && creating.projectId === project.id ? (
                        <CreateRow
                          key={`create-category-${project.id}`}
                          kind="category"
                          indent
                          onCommit={name => commitCategory(currentSpace.id, project.id, name, creating.then)}
                          onCancel={endCreate}
                        />
                      ) : project.categories.length === 0 && (
                        <button
                          type="button"
                          onClick={() => handleAddCategory(project.id)}
                          className="mx-2 w-[calc(100%-16px)] text-white/55 hover:text-white/80 text-xs font-sans py-1.5 pl-7 pr-2 rounded-md hover:bg-white/[0.04] transition-colors text-left"
                        >
                          + Add category
                        </button>
                      )}
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
              <div className="px-3 mt-2">
                <button
                  type="button"
                  onClick={() => startCreate({ kind: "project", spaceId: currentSpace.id })}
                  className="w-full flex items-center gap-2 text-white/55 hover:text-white/80 hover:bg-white/[0.04] rounded-md text-[13px] font-sans py-1.5 px-2 transition-colors text-left"
                >
                  <ProjectIcon className="h-3.5 w-3.5" />
                  New project
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="text-white/40 font-sans text-xs p-8 text-center">Select a space</div>
        )}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-black-800">
        <div className="text-[11px] font-sans text-white/20">
          {currentSpace ? (() => {
            const pc = currentSpace.projects.length;
            const cc = currentSpace.projects.reduce((sum, p) => sum + p.categories.length, 0);
            return `${pc} project${pc !== 1 ? 's' : ''} · ${cc} ${cc !== 1 ? 'categories' : 'category'}`;
          })() : ''}
        </div>
      </div>

    </div>
  );
}

function DroppableProjectItem({ spaceId, projectId, children }: {
  spaceId: string; projectId: string; children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `proj-drop:${spaceId}:${projectId}`,
  });

  return (
    <div ref={setNodeRef} className={`transition-colors rounded ${isOver ? 'ring-1' : ''}`}
      style={isOver ? { backgroundColor: 'var(--accent-subtle)' } : undefined}
    >
      {children}
    </div>
  );
}

function DroppableCategoryItem({ spaceId, projectId, categoryId, children }: {
  spaceId: string; projectId: string; categoryId: string; children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `cat-drop:${spaceId}:${projectId}:${categoryId}`,
  });

  return (
    <div ref={setNodeRef} className={`transition-colors rounded-md ${isOver ? 'ring-1' : ''}`}
      style={isOver ? { backgroundColor: 'var(--accent-subtle)' } : undefined}
    >
      {children}
    </div>
  );
}
