import { useState } from 'react';
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore";
import { v7 as uuidv7 } from "uuid";
import { ChevronDownIcon } from "~src/components/icons/ChevronDownIcon";
import config from '../../package.json';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface EditableTextProps {
  value: string;
  onSave: (value: string) => void;
  className?: string;
}

function EditableText({ value, onSave, className }: EditableTextProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);

  const handleSave = () => {
    if (editValue.trim()) {
      onSave(editValue.trim());
      setIsEditing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setEditValue(value);
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <input
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className={`bg-white/10 text-white px-2 py-1 rounded-md outline-none focus:ring-1 focus:ring-blue-500 font-sans ${className}`}
        autoFocus
      />
    );
  }

  return (
    <span
      onClick={() => setIsEditing(true)}
      className={`cursor-pointer hover:text-white/90 ${className}`}
    >
      {value}
    </span>
  );
}

interface SortableSpaceItemProps {
  id: string;
  index: number;
  space: any;
  activeSpace: number;
  expandedSpaces: Set<number>;
  onToggleSpace: (index: number) => void;
  onUpdateSpace: (space: any) => void;
  onDeleteSpace: (id: string) => void;
}

function SortableSpaceItem({
  id,
  index,
  space,
  activeSpace,
  expandedSpaces,
  onToggleSpace,
  onUpdateSpace,
  onDeleteSpace,
}: SortableSpaceItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className={`flex items-center gap-2 py-2 px-3 rounded-md cursor-pointer transition-colors ${
          activeSpace === index ? 'bg-white/10' : 'hover:bg-white/5'
        }`}
        onClick={() => {
          if (useSavedSpacesStore.getState().activeSpace !== index) {
            useSavedSpacesStore.getState().setActiveSpace(index);
          }
        }}
      >
        <button
          {...attributes}
          {...listeners}
          className="opacity-40 hover:opacity-50 hover:!opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
        >
          <svg className="w-4 h-4 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
          </svg>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleSpace(index);
          }}
          className="text-white/50 hover:text-white/70 transition-colors"
        >
          <ChevronDownIcon className={`w-4 h-4 transition-transform ${expandedSpaces.has(index) ? 'rotate-0' : '-rotate-90'}`} />
        </button>
        <EditableText
          value={space.name}
          onSave={(name) => onUpdateSpace({ ...space, name })}
          className="flex-1 text-white/70 font-sans font-medium"
        />
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDeleteSpace(space.id);
          }}
          className="text-white/30 hover:text-red-400 transition-colors text-xs"
          title="Delete Space"
        >
          ×
        </button>
      </div>
    </div>
  );
}

export function LeftPanel() {
  const { savedSpaces, activeSpace, setActiveSpace, addSavedSpace, removeSavedSpace, updateSavedSpace, addSavedProject, removeSavedProject, updateSavedProject, addSavedCategory, removeSavedCategory, updateSavedCategory, reorderSpaces } = useSavedSpacesStore();
  const [expandedSpaces, setExpandedSpaces] = useState<Set<number>>(new Set([0]));
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = savedSpaces.findIndex((space) => space.id === active.id);
      const newIndex = savedSpaces.findIndex((space) => space.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        reorderSpaces(oldIndex, newIndex);

        if (activeSpace === oldIndex) {
          setActiveSpace(newIndex);
        } else if (activeSpace === newIndex) {
          setActiveSpace(oldIndex);
        }
      }
    }
  };

  const toggleSpace = (index: number) => {
    const newExpanded = new Set(expandedSpaces);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedSpaces(newExpanded);
  };

  const toggleProject = (projectId: string) => {
    const newExpanded = new Set(expandedProjects);
    if (newExpanded.has(projectId)) {
      newExpanded.delete(projectId);
    } else {
      newExpanded.add(projectId);
    }
    setExpandedProjects(newExpanded);
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

  const handleAddSpace = () => {
    const newSpace = {
      id: uuidv7(),
      name: "New Space",
      projects: [],
    };
    addSavedSpace(newSpace);
    const newIndex = savedSpaces.length;
    setExpandedSpaces(new Set([...expandedSpaces, newIndex]));
  };

  const handleDeleteSpace = (spaceId: string) => {
    const space = savedSpaces.find(s => s.id === spaceId);
    if (space && confirm(`Delete space "${space.name}"?`)) {
      removeSavedSpace(space);
      if (savedSpaces.length > 0) {
        setActiveSpace(Math.max(0, activeSpace - 1));
      }
    }
  };

  const handleAddProject = (spaceId: string) => {
    const newProject = {
      id: uuidv7(),
      name: "New Project",
      categories: [],
    };
    addSavedProject(spaceId, newProject);
    setExpandedProjects(new Set([...expandedProjects, newProject.id]));
  };

  const handleDeleteProject = (spaceId: string, projectId: string) => {
    const space = savedSpaces.find(s => s.id === spaceId);
    const project = space?.projects.find(p => p.id === projectId);
    if (project && confirm(`Delete project "${project.name}"?`)) {
      removeSavedProject(spaceId, project);
    }
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
    if (category && confirm(`Delete category "${category.name}"?`)) {
      removeSavedCategory(spaceId, projectId, category);
    }
  };

  return (
    <div className="w-64 h-full flex flex-col bg-black/900">
      <div className="h-16 p-4 flex items-end gap-2 border-b border-black-800">
        <h1 className="text-white/90 font-sans text-2xl">FlexTab</h1>
        <p className="text-white/50 font-sans text-sm">vssss{config.version || '0.0.1'}</p>
      </div>
      <div className="flex flex-col gap-2 p-3 overflow-y-auto flex-1 text-sm">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-white/70 font-sans text-sm font-medium">Spaces</h2>
          <button
            onClick={handleAddSpace}
            className="text-white/50 hover:text-white/70 text-lg leading-none font-sans"
            title="Add Space"
          >
            +
          </button>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={savedSpaces.map((space) => space.id)}
            strategy={verticalListSortingStrategy}
          >
            {savedSpaces.map((space, spaceIndex) => (
              <div key={space.id} className="flex flex-col gap-1">
                <SortableSpaceItem
                  id={space.id}
                  index={spaceIndex}
                  space={space}
                  activeSpace={activeSpace}
                  expandedSpaces={expandedSpaces}
                  onToggleSpace={toggleSpace}
                  onUpdateSpace={updateSavedSpace}
                  onDeleteSpace={handleDeleteSpace}
                />
                {expandedSpaces.has(spaceIndex) && space.projects.map((project: any) => (
                  <div key={project.id} className="flex flex-col gap-1 ml-4">
                    <div className="flex items-center gap-2 py-2 px-3 rounded-md cursor-pointer transition-colors hover:bg-white/5">
                      <button
                        onClick={() => toggleProject(project.id)}
                        className="text-white/50 hover:text-white/70 transition-colors"
                      >
                        <ChevronDownIcon className={`w-4 h-4 transition-transform ${expandedProjects.has(project.id) ? 'rotate-0' : '-rotate-90'}`} />
                      </button>
                      <EditableText
                        value={project.name}
                        onSave={(name) => updateSavedProject(space.id, { ...project, name })}
                        className="flex-1 text-white/60 font-sans text-sm"
                      />
                      <button
                        onClick={() => handleDeleteProject(space.id, project.id)}
                        className="text-white/30 hover:text-red-400 transition-colors text-xs"
                        title="Delete Project"
                      >
                        ×
                      </button>
                    </div>
                    {expandedProjects.has(project.id) && project.categories.map((category: any) => (
                      <div key={category.id} className="flex flex-col gap-1 ml-4">
                        <div className="flex items-center gap-2 py-2 px-3 rounded-md cursor-pointer transition-colors hover:bg-white/5">
                          <button
                            onClick={() => toggleCategory(category.id)}
                            className="text-white/50 hover:text-white/70 transition-colors"
                          >
                            <ChevronDownIcon className={`w-4 h-4 transition-transform ${expandedCategories.has(category.id) ? 'rotate-0' : '-rotate-90'}`} />
                          </button>
                          <EditableText
                            value={category.name}
                            onSave={(name) => updateSavedCategory(space.id, project.id, { ...category, name })}
                            className="flex-1 text-white/50 font-sans text-sm"
                          />
                          <button
                            onClick={() => handleDeleteCategory(space.id, project.id, category.id)}
                            className="text-white/30 hover:text-red-400 transition-colors text-xs"
                            title="Delete Category"
                          >
                            ×
                          </button>
                        </div>
                        {expandedCategories.has(category.id) && category.groups.length > 0 && (
                          <div className="flex flex-col gap-1 ml-4">
                            {category.groups.map((group: any) => (
                              <div
                                key={group.id}
                                className="flex items-center gap-2 py-1.5 px-3 rounded-md text-white/40 text-xs font-sans hover:bg-white/5"
                              >
                                <span className="w-2 h-2 bg-white/20 rounded-full" />
                                <span className="flex-1">{group.name}</span>
                                <span className="text-white/30">({group.tabs.length})</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    {expandedProjects.has(project.id) && (
                      <button
                        onClick={() => handleAddCategory(space.id, project.id)}
                        className="ml-6 text-white/50 hover:text-white/70 text-xs font-sans py-1.5 px-3 rounded-md hover:bg-white/5 transition-colors"
                      >
                        + Add Category
                      </button>
                    )}
                  </div>
                ))}
                {expandedSpaces.has(spaceIndex) && (
                  <button
                    onClick={() => handleAddProject(space.id)}
                    className="ml-4 text-white/50 hover:text-white/70 text-xs font-sans py-1.5 px-3 rounded-md hover:bg-white/5 transition-colors"
                  >
                    + Add Project
                  </button>
                )}
              </div>
            ))}
          </SortableContext>
        </DndContext>

        {savedSpaces.length === 0 && (
          <div
            className="text-white/50 font-sans text-sm p-12 text-center border border-black-800 rounded-md border-dashed hover:bg-white/5 transition-colors"
          >
            <p className="mb-3">No spaces yet</p>
            <button
              onClick={handleAddSpace}
              className="text-white/70 hover:text-white/90 font-sans text-sm underline"
            >
              Create your first space
            </button>
          </div>
        )}
      </div>
      <div className="h-16 p-4 flex items-center gap-2 border-t border-black-800">
        <div className="flex-1 text-xs font-sans text-white/50">
          {savedSpaces.length} space{savedSpaces.length !== 1 ? 's' : ''} · {savedSpaces[activeSpace]?.projects.length || 0} project{(savedSpaces[activeSpace]?.projects.length || 0) !== 1 ? 's' : ''}
        </div>
      </div>
    </div>
  );
}
