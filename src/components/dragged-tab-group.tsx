import type { SavedGroup } from "~src/types"

interface DraggedTabGroupProps {
  group: SavedGroup
}

export function DraggedTabGroup({ group }: DraggedTabGroupProps) {
  // Sort tabs by order field to maintain consistent ordering
  const sortedTabs = [...(group.tabs || [])].sort((a, b) => {
    const orderA = a.order ?? 0;
    const orderB = b.order ?? 0;
    return orderA - orderB;
  });

  // If 4 or fewer tabs, show all. If more than 4, show first 3 + stack indicator
  const hasMoreThanFour = sortedTabs.length > 4;
  const displayTabs = hasMoreThanFour ? sortedTabs.slice(0, 3) : sortedTabs;
  const extraCount = hasMoreThanFour ? sortedTabs.length - 3 : 0;

  return (
    <div className="flex flex-col gap-2 p-4">
      <h3 className="pl-6 text-white/60 font-sans text-sm">{group.name}</h3>
      {sortedTabs.length > 0 ? (
        <div className="grid grid-cols-4 gap-2 border border-black-800 rounded-md p-2 transition-colors">
          {displayTabs.map((tab) => (
            <div
              key={tab.id}
              className="flex items-center gap-2 py-2 px-3 bg-white/5 rounded-md hover:bg-white/10 transition-colors group"
            >
              {/* Drag handle */}
              <div
                className="opacity-40 group-hover:opacity-50 hover:!opacity-100 cursor-grab active:cursor-grabbing p-1 rounded transition-opacity"
                title="Drag to reorder"
              >
                <svg className="w-3 h-3 text-white/50" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"></path>
                </svg>
              </div>

              {/* Tab content */}
              <div className="flex items-center gap-3 flex-1 cursor-pointer overflow-hidden">
                <img src={tab.favicon} alt={tab.title} className="w-5 h-5" />
                <div className="flex flex-col gap-0.5 text-white/90 overflow-hidden">
                  <div className="text-xs truncate">{tab.title}</div>
                  <div className="text-white/50 text-xs truncate flex-1">{tab.url}</div>
                </div>
              </div>
            </div>
          ))}

          {/* Stack indicator replaces the 4th position when there are more than 4 tabs */}
          {hasMoreThanFour && (
            <div className="flex items-center justify-center bg-white/5 rounded-md py-2 px-3 relative">
              {/* Stack effect with multiple divs positioned behind */}
              <div className="absolute inset-0 bg-white/5 rounded-md translate-x-0.5 translate-y-0.5 opacity-60"></div>
              <div className="absolute inset-0 bg-white/5 rounded-md translate-x-1 translate-y-1 opacity-40"></div>
              <div className="relative z-10 text-white/60 text-xs font-medium">
                +{extraCount}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-white/50 font-sans text-sm p-12 text-center border border-black-800 rounded-md border-dashed">
          No saved tabs yet
        </div>
      )}
    </div>
  )
}