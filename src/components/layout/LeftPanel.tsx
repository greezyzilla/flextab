import { useState, useEffect, useRef } from 'react';
import { useDroppable } from "@dnd-kit/core";
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore";
import { v7 as uuidv7 } from "uuid";
import config from '../../../package.json';
import { showUndoToast } from "~src/components/UndoToast";

const SPACE_COLORS = [
  "", "#3b82f6", "#8b5cf6", "#ec4899", "#ef4444",
  "#f97316", "#eab308", "#22c55e", "#06b6d4",
];

interface ContextMenuState {
  type: 'project' | 'category';
  id: string;
  spaceId: string;
  projectId?: string;
  x: number;
  y: number;
}

function SpaceSettings({ onClose }: { onClose: () => void }) {
  const { savedSpaces, activeSpaceId, updateSavedSpace } = useSavedSpacesStore();
  const currentSpace = savedSpaces.find(s => s.id === activeSpaceId);
  const ref = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(currentSpace?.name ?? "");
  const [abbreviation, setAbbreviation] = useState(currentSpace?.abbreviation ?? "");
  const [color, setColor] = useState(currentSpace?.color ?? "");

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        ref={ref}
        className="bg-black-900 border border-black-700 rounded-xl w-80 p-5 flex flex-col gap-4 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-white/80 font-sans text-sm font-medium">Space Settings</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white/70 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-white/40 text-[11px] font-sans">Name</label>
          <input ref={nameRef} type="text" value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") onClose(); }}
            className="bg-black-800 border border-black-700 rounded-md px-2.5 py-1.5 text-white/90 text-sm font-sans outline-none focus:border-white/30" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-white/40 text-[11px] font-sans">Abbreviation (max 2)</label>
          <input type="text" value={abbreviation} onChange={e => setAbbreviation(e.target.value.slice(0, 2))}
            placeholder={currentSpace.name.slice(0, 2).toUpperCase()}
            onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") onClose(); }}
            className="bg-black-800 border border-black-700 rounded-md px-2.5 py-1.5 text-white/90 text-sm font-sans outline-none focus:border-white/30 w-20" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-white/40 text-[11px] font-sans">Color</label>
          <div className="flex gap-2 flex-wrap">
            {SPACE_COLORS.map(c => (
              <button key={c || "default"} onClick={() => setColor(c)}
                className={`w-6 h-6 rounded-full border-2 transition-all ${color === c ? 'border-white/70 scale-110' : 'border-transparent hover:border-white/30'}`}
                style={{ backgroundColor: c || 'rgba(255,255,255,0.15)' }} />
            ))}
          </div>
        </div>
        <button onClick={handleSave} className="w-full px-3 py-2 bg-white/10 hover:bg-white/15 text-white/80 text-sm font-sans rounded-md transition-colors mt-1">Save</button>
      </div>
    </div>
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
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  const currentSpace = savedSpaces.find(s => s.id === activeSpaceId);

  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) setContextMenu(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [contextMenu]);

  useEffect(() => {
    if (renamingId && renameRef.current) {
      renameRef.current.focus();
      renameRef.current.select();
    }
  }, [renamingId]);

  const toggleProject = (projectId: string) => {
    toggleExpandedProject(projectId);
    setActiveProject(projectId);
  };

  const startRename = (id: string, currentName: string) => {
    setRenameValue(currentName);
    setRenamingId(id);
    setContextMenu(null);
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

  const handleAddProject = () => {
    if (!currentSpace) return;
    const id = uuidv7();
    addSavedProject(currentSpace.id, { id, name: "New Project", categories: [] });
    if (!expandedProjectIds.includes(id)) toggleExpandedProject(id);
    setTimeout(() => startRename(id, "New Project"), 50);
  };

  const handleAddCategory = (projectId: string) => {
    if (!currentSpace) return;
    const id = uuidv7();
    addSavedCategory(currentSpace.id, projectId, { id, name: "New Category", groups: [] });
    setTimeout(() => startRename(id, "New Category"), 50);
  };

  const handleDelete = () => {
    if (!contextMenu || !currentSpace) return;
    if (contextMenu.type === 'project') {
      const project = currentSpace.projects.find(p => p.id === contextMenu.id);
      if (project) {
        removeSavedProject(currentSpace.id, project);
        showUndoToast(`Deleted "${project.name}"`, () => addSavedProject(currentSpace.id, project));
      }
    } else {
      const project = currentSpace.projects.find(p => p.id === contextMenu.projectId);
      const category = project?.categories.find(c => c.id === contextMenu.id);
      if (category && project) {
        removeSavedCategory(currentSpace.id, project.id, category);
        showUndoToast(`Deleted "${category.name}"`, () => addSavedCategory(currentSpace.id, project.id, category));
      }
    }
    setContextMenu(null);
  };

  return (
    <div className="w-64 h-full flex flex-col bg-black-900 relative">
      {/* Header */}
      <div className="h-16 p-4 flex items-end gap-2 border-b border-black-800">
        <h1 className="text-white/90 font-sans text-2xl">FlexTab</h1>
        <p className="text-white/50 font-sans text-sm">v{config.version || '0.0.1'}</p>
      </div>

      {/* Space header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-black-800">
        <div className="flex items-center gap-2.5 min-w-0">
          {currentSpace?.color && <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: currentSpace.color }} />}
          <h2 className="text-white/70 font-sans text-sm font-medium truncate">{currentSpace?.name || 'No Space'}</h2>
        </div>
        {currentSpace && (
          <button onClick={() => setShowSettings(!showSettings)}
            className={`text-white/30 hover:text-white/60 transition-colors shrink-0 ${showSettings ? 'text-white/60' : ''}`} title="Space settings">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
          </button>
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
                  {/* Project — section label style */}
                  <DroppableProjectItem
                    spaceId={currentSpace.id}
                    projectId={project.id}
                  >
                    <div
                      className="group/proj flex items-center gap-1 px-4 py-1.5 cursor-pointer"
                      onClick={() => toggleProject(project.id)}
                      onContextMenu={e => {
                        e.preventDefault();
                        setContextMenu({ type: 'project', id: project.id, spaceId: currentSpace.id, x: e.clientX, y: e.clientY });
                      }}
                    >
                      <svg className={`w-3 h-3 text-white/20 transition-transform shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                      </svg>

                      {renamingId === project.id ? (
                        <input ref={renameRef} type="text" value={renameValue}
                          onChange={e => setRenameValue(e.target.value)} onBlur={submitRename}
                          onKeyDown={e => { if (e.key === "Enter") submitRename(); if (e.key === "Escape") setRenamingId(null); }}
                          onClick={e => e.stopPropagation()}
                          className="flex-1 bg-white/10 text-white/90 px-2 py-0.5 rounded outline-none focus:ring-1 focus:ring-[var(--accent)] font-sans text-xs min-w-0" />
                      ) : (
                        <span className="flex-1 text-white/40 font-sans text-[11px] font-semibold uppercase tracking-wider truncate">
                          {project.name}
                        </span>
                      )}

                      <button
                        onClick={e => { e.stopPropagation(); handleAddCategory(project.id); }}
                        className="opacity-0 group-hover/proj:opacity-100 text-white/20 hover:text-white/50 transition-all shrink-0"
                        title="Add category"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                      </button>
                    </div>
                  </DroppableProjectItem>

                  {/* Categories */}
                  {isExpanded && (
                    <div className="mt-0.5">
                      {project.categories.map((category) => {
                        const isActive = activeCategoryId === category.id;
                        return (
                          <DroppableCategoryItem
                            key={category.id}
                            spaceId={currentSpace.id}
                            projectId={project.id}
                            categoryId={category.id}
                          >
                            <div
                              className={`flex items-center gap-2 mx-2 px-4 py-[7px] rounded-md cursor-pointer transition-colors ${
                                isActive
                                  ? 'text-white/80'
                                  : 'text-white/45 hover:text-white/65 hover:bg-white/[0.03]'
                              }`}
                              style={isActive ? { backgroundColor: 'var(--accent-subtle)' } : undefined}
                              onClick={() => {
                                if (activeProjectId !== project.id) setActiveProject(project.id);
                                setActiveCategory(category.id);
                              }}
                              onContextMenu={e => {
                                e.preventDefault();
                                setContextMenu({ type: 'category', id: category.id, spaceId: currentSpace.id, projectId: project.id, x: e.clientX, y: e.clientY });
                              }}
                            >
                              <span className={`w-1 h-1 rounded-full shrink-0 ${isActive ? '' : 'bg-white/20'}`} style={isActive ? { backgroundColor: 'var(--accent)' } : undefined} />
                              {renamingId === category.id ? (
                                <input ref={renameRef} type="text" value={renameValue}
                                  onChange={e => setRenameValue(e.target.value)} onBlur={submitRename}
                                  onKeyDown={e => { if (e.key === "Enter") submitRename(); if (e.key === "Escape") setRenamingId(null); }}
                                  onClick={e => e.stopPropagation()}
                                  className="flex-1 bg-white/10 text-white/90 px-2 py-0.5 rounded outline-none focus:ring-1 focus:ring-[var(--accent)] font-sans text-xs min-w-0" />
                              ) : (
                                <span className="flex-1 font-sans text-[13px] truncate">{category.name}</span>
                              )}
                              {category.groups.length > 0 && (
                                <span className={`text-[10px] font-sans shrink-0 ${isActive ? 'text-white/30' : 'text-white/15'}`}>
                                  {category.groups.length}
                                </span>
                              )}
                            </div>
                          </DroppableCategoryItem>
                        );
                      })}

                      {project.categories.length === 0 && (
                        <button
                          onClick={() => handleAddCategory(project.id)}
                          className="mx-2 w-[calc(100%-16px)] text-white/20 hover:text-white/40 text-xs font-sans py-2 px-4 rounded-md hover:bg-white/[0.03] transition-colors text-left"
                        >
                          + Add category
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            <div className="px-4 mt-3">
              <button
                onClick={handleAddProject}
                className="w-full text-white/20 hover:text-white/40 text-[11px] font-sans font-semibold uppercase tracking-wider py-2 px-1 transition-colors text-left"
              >
                + New Project
              </button>
            </div>
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

      {/* Context menu - rendered at end */}
      {contextMenu && (
        <div ref={contextMenuRef} className="fixed bg-black-800 border border-black-700 rounded-lg shadow-xl py-1 z-50 w-36" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <button onClick={() => {
            const name = contextMenu.type === 'project'
              ? currentSpace?.projects.find(p => p.id === contextMenu.id)?.name
              : currentSpace?.projects.find(p => p.id === contextMenu.projectId)?.categories.find(c => c.id === contextMenu.id)?.name;
            if (name) startRename(contextMenu.id, name);
          }} className="w-full text-left px-3 py-1.5 text-white/70 hover:text-white/90 hover:bg-white/5 text-xs transition-colors">Rename</button>
          <button onClick={handleDelete} className="w-full text-left px-3 py-1.5 text-red-400/70 hover:text-red-400 hover:bg-white/5 text-xs transition-colors">Delete</button>
        </div>
      )}
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
      style={isOver ? { backgroundColor: 'var(--accent-subtle)', ringColor: 'var(--accent)' } : undefined}
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
      style={isOver ? { backgroundColor: 'var(--accent-subtle)', ringColor: 'var(--accent)' } : undefined}
    >
      {children}
    </div>
  );
}
