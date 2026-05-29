import { useState, useEffect, createContext, useContext } from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore";
import type { SavedProject, SavedCategory } from "~src/types";
import { v7 as uuidv7 } from "uuid";
import { EditableText } from "~src/components/EditableText";
import config from '../../../package.json';
import { showUndoToast } from "~src/components/UndoToast";

// --- Context to eliminate prop drilling ---

interface LeftPanelContextValue {
  editMode: boolean;
  editingProject: string | null;
  editingCategory: string | null;
  expandedProjects: Set<string>;
  expandedCategories: Set<string>;
  setEditingProject: (id: string | null) => void;
  setEditingCategory: (id: string | null) => void;
  toggleProject: (projectId: string) => void;
  toggleCategory: (categoryId: string) => void;
  handleDeleteProject: (spaceId: string, projectId: string) => void;
  handleDeleteCategory: (spaceId: string, projectId: string, categoryId: string) => void;
}

const LeftPanelContext = createContext<LeftPanelContextValue>(null!);
const useLeftPanelContext = () => useContext(LeftPanelContext);

// --- Sortable components ---

function SortableProject({ project, spaceId }: { project: SavedProject; spaceId: string }) {
  const { editMode, editingProject, expandedProjects, setEditingProject, toggleProject, handleDeleteProject } = useLeftPanelContext();
  const { updateSavedProject } = useSavedSpacesStore();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: project.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div className="flex items-center gap-2 py-2 px-2 rounded-md">
        {editMode && (
          <div {...attributes} {...listeners} className="cursor-grab text-white/30 hover:text-white/50">
            ⋮⋮
          </div>
        )}
        {!editMode && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleProject(project.id);
            }}
            className="text-white/50 hover:text-white/70 transition-colors"
          >
            <svg
              className={`w-4 h-4 transition-transform ${expandedProjects.has(project.id) ? 'rotate-90' : 'rotate-0'}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
        <EditableText
          value={project.name}
          onSave={(name) => updateSavedProject(spaceId, { ...project, name })}
          className="flex-1 text-white/60 font-sans text-sm"
          isEditing={editMode && editingProject === project.id}
          canEdit={editMode}
          onEdit={() => setEditingProject(project.id)}
          onCancel={() => setEditingProject(null)}
        />
        {editMode && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteProject(spaceId, project.id);
            }}
            className="text-white/30 hover:text-red-400 transition-colors text-xs"
            title="Delete Project"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}

function SortableCategory({ category, spaceId, projectId }: { category: SavedCategory; spaceId: string; projectId: string }) {
  const { editMode, editingCategory, setEditingCategory, handleDeleteCategory } = useLeftPanelContext();
  const { activeCategoryId, setActiveCategory, updateSavedCategory } = useSavedSpacesStore();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: category.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className={`flex items-center gap-2 py-2 px-2 rounded-md cursor-pointer transition-colors ${
          activeCategoryId === category.id ? 'bg-white/10' : 'hover:bg-white/5'
        }`}
        onClick={() => setActiveCategory(category.id)}
      >
        {editMode && (
          <div {...attributes} {...listeners} className="cursor-grab text-white/30 hover:text-white/50">
            ⋮⋮
          </div>
        )}
        <EditableText
          value={category.name}
          onSave={(name) => updateSavedCategory(spaceId, projectId, { ...category, name })}
          className="flex-1 text-white/50 font-sans text-sm"
          isEditing={editMode && editingCategory === category.id}
          canEdit={editMode}
          onEdit={() => setEditingCategory(category.id)}
          onCancel={() => setEditingCategory(null)}
        />
        {editMode && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteCategory(spaceId, projectId, category.id);
            }}
            className="text-white/30 hover:text-red-400 transition-colors text-xs"
            title="Delete Category"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}

// --- Main panel ---

export function LeftPanel() {
  const { savedSpaces, activeSpaceId, setActiveProject, addSavedProject, removeSavedProject, addSavedCategory, removeSavedCategory, reorderProjects, reorderCategories } = useSavedSpacesStore();
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [editingProject, setEditingProject] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    if (!editMode) {
      setEditingProject(null);
      setEditingCategory(null);
    }
  }, [editMode]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const currentSpace = savedSpaces.find(s => s.id === activeSpaceId);

  const toggleProject = (projectId: string) => {
    const newExpanded = new Set(expandedProjects);
    if (newExpanded.has(projectId)) {
      newExpanded.delete(projectId);
    } else {
      newExpanded.add(projectId);
    }
    setExpandedProjects(newExpanded);
    setActiveProject(projectId);
  };

  const toggleCategory = (categoryId: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryId)) {
      newExpanded.delete(categoryId);
    } else {
      newExpanded.add(categoryId);
    }
    setExpandedCategories(newExpanded);
  };

  const handleAddProject = () => {
    if (!currentSpace) return;
    const newProject = {
      id: uuidv7(),
      name: "New Project",
      categories: [],
    };
    addSavedProject(currentSpace.id, newProject);
    setExpandedProjects(new Set([...expandedProjects, newProject.id]));
  };

  const handleDeleteProject = (spaceId: string, projectId: string) => {
    const space = savedSpaces.find(s => s.id === spaceId);
    const project = space?.projects.find(p => p.id === projectId);
    if (!project) return;
    removeSavedProject(spaceId, project);
    showUndoToast(`Deleted project "${project.name}"`, () => {
      addSavedProject(spaceId, project);
    });
  };

  const handleAddCategory = (spaceId: string, projectId: string) => {
    const newCategory = {
      id: uuidv7(),
      name: "New Category",
      groups: [],
    };
    addSavedCategory(spaceId, projectId, newCategory);
    setExpandedCategories(new Set([...expandedCategories, newCategory.id]));
  };

  const handleDeleteCategory = (spaceId: string, projectId: string, categoryId: string) => {
    const space = savedSpaces.find(s => s.id === spaceId);
    const project = space?.projects.find(p => p.id === projectId);
    const category = project?.categories.find(c => c.id === categoryId);
    if (!category) return;
    removeSavedCategory(spaceId, projectId, category);
    showUndoToast(`Deleted category "${category.name}"`, () => {
      addSavedCategory(spaceId, projectId, category);
    });
  };

  const handleProjectDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id && currentSpace) {
      const oldIndex = currentSpace.projects.findIndex(p => p.id === active.id);
      const newIndex = currentSpace.projects.findIndex(p => p.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        reorderProjects(currentSpace.id, oldIndex, newIndex);
      }
    }
  };

  const handleCategoryDragEnd = (projectId: string) => (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id && currentSpace) {
      const project = currentSpace.projects.find(p => p.id === projectId);
      if (project) {
        const oldIndex = project.categories.findIndex(c => c.id === active.id);
        const newIndex = project.categories.findIndex(c => c.id === over.id);
        if (oldIndex !== -1 && newIndex !== -1) {
          reorderCategories(currentSpace.id, projectId, oldIndex, newIndex);
        }
      }
    }
  };

  const contextValue: LeftPanelContextValue = {
    editMode,
    editingProject,
    editingCategory,
    expandedProjects,
    expandedCategories,
    setEditingProject,
    setEditingCategory,
    toggleProject,
    toggleCategory,
    handleDeleteProject,
    handleDeleteCategory,
  };

  return (
    <LeftPanelContext.Provider value={contextValue}>
      <div className="w-64 h-full flex flex-col bg-black/900">
        <div className="h-16 p-4 flex items-end gap-2 border-b border-black-800">
          <h1 className="text-white/90 font-sans text-2xl">FlexTab</h1>
          <p className="text-white/50 font-sans text-sm">v{config.version || '0.0.1'}</p>
        </div>
        <div className="flex flex-col gap-2 p-3 overflow-y-auto flex-1 text-sm">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-white/70 font-sans text-sm font-medium">
              {currentSpace?.name || 'No Space Selected'}
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setEditMode(!editMode)}
                className={`text-white/50 hover:text-white/70 transition-colors ${editMode ? 'text-green-400' : ''}`}
                title={editMode ? "Done Editing" : "Edit Mode"}
              >
                {editMode ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                )}
              </button>
              {currentSpace && (
                <button
                  onClick={handleAddProject}
                  className="text-white/50 hover:text-white/70 text-lg leading-none font-sans"
                  title="Add Project"
                >
                  +
                </button>
              )}
            </div>
          </div>

          {currentSpace ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleProjectDragEnd}
            >
              <SortableContext items={currentSpace.projects.map(p => p.id)} strategy={verticalListSortingStrategy}>
                {currentSpace.projects.map((project) => (
                  <div key={project.id} className="flex flex-col gap-2">
                    <SortableProject project={project} spaceId={currentSpace.id} />
                    {expandedProjects.has(project.id) && (
                      <div className="flex flex-col gap-2">
                        <DndContext
                          sensors={sensors}
                          collisionDetection={closestCenter}
                          onDragEnd={handleCategoryDragEnd(project.id)}
                        >
                          <SortableContext items={project.categories.map(c => c.id)} strategy={verticalListSortingStrategy}>
                            {project.categories.map((category) => (
                              <SortableCategory
                                key={category.id}
                                category={category}
                                spaceId={currentSpace.id}
                                projectId={project.id}
                              />
                            ))}
                          </SortableContext>
                        </DndContext>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAddCategory(currentSpace.id, project.id);
                          }}
                          className="w-full text-white/50 hover:text-white/70 text-sm font-sans py-2 px-2 rounded-md border border-dashed border-white/20 hover:border-white/40 hover:bg-white/5 transition-colors"
                        >
                          + Add Category
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </SortableContext>
            </DndContext>
          ) : (
            <div
              className="text-white/50 font-sans text-sm p-12 text-center border border-black-800 rounded-md border-dashed hover:bg-white/5 transition-colors"
            >
              <p className="mb-3">No space selected</p>
              <p className="text-white/30">Select a space from the profile panel</p>
            </div>
          )}
        </div>
        <div className="h-16 p-4 flex items-center gap-2 border-t border-black-800">
          <div className="flex-1 text-xs font-sans text-white/50">
            {currentSpace?.projects.length || 0} project{(currentSpace?.projects.length || 0) !== 1 ? 's' : ''}
          </div>
        </div>
      </div>
    </LeftPanelContext.Provider>
  );
}
