import { useSavedSpaces } from "~src/context/SavedSpacesContext";
import { TabGroup } from "./tab-group";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

function SortableGroup({ group }: { group: any }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: group.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative">
      <div className="absolute top-4 left-4 z-10 opacity-30 hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing" {...attributes} {...listeners}>
        <svg className="w-4 h-4 text-white/50" fill="currentColor" viewBox="0 0 20 20">
          <path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"></path>
        </svg>
      </div>
      <TabGroup group={group} />
    </div>
  );
}

export function ContentPanel() {
  const { savedSpaces, activeSpace, activeProject, activeCategory } = useSavedSpaces();

  const currentGroups = savedSpaces.at(activeSpace)?.projects.at(activeProject)?.categories.at(activeCategory)?.groups || [];
  const sortedGroups = [...currentGroups].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  console.log(savedSpaces.at(activeSpace)?.projects.at(activeProject)?.categories.at(activeCategory))
  return (
    <div className="flex-1 flex flex-col">
      <div className="flex justify-between gap-2 p-4 border-b border-black-800">
        <h2 className="text-white/70 font-sans text-base font-medium">{savedSpaces.at(activeSpace)?.projects.at(activeProject)?.categories.at(activeCategory)?.name}</h2>
        <div className="flex gap-2">
          <button className="text-white/70 font-sans text-sm">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>
        </div>
      </div>
      {sortedGroups.length > 0 ? (
        <div className="flex flex-col gap-2">
          <SortableContext items={sortedGroups.map(g => g.id)} strategy={verticalListSortingStrategy}>
            {sortedGroups.map((group) => (
              <SortableGroup key={group.id} group={group} />
            ))}
          </SortableContext>
        </div>
      ) : (
        <div className="text-white/50 font-sans text-sm p-12 text-center flex items-center justify-center">No saved groups yet</div>
      )}
    </div>
  )
}
