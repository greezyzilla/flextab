import { ContentPanel, LeftPanel, ProfilePanel, RightPanel, DragOverlayContent } from "~src/components"
import { SearchBar } from "~src/components/SearchBar"
import { UndoToastContainer } from "~src/components/UndoToast"
import { ErrorBoundary } from "~src/components/ErrorBoundary"
import "../../style.css"

import { DndContext, DragOverlay } from "@dnd-kit/core"
import { useDragAndDrop } from "~src/hooks/useDragAndDrop"
import { useHydrated } from "~src/store/useSavedSpacesStore"

function LoadingScreen() {
  return (
    <div className="flex items-center justify-center h-screen w-screen bg-black-900">
      <div className="text-white/50 font-sans text-sm">Loading...</div>
    </div>
  )
}

function NewTabPageContent() {
  const { 
    handleDragStart, 
    handleDragEnd, 
    collisionDetectionStrategy, 
    activeId, 
    draggedTab, 
    draggedSavedTab, 
    draggedGroup 
  } = useDragAndDrop();

  return (
    <DndContext
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      collisionDetection={collisionDetectionStrategy}
    >
      <div className="flex h-screen w-screen bg-black-900">
        <ProfilePanel />
        <LeftPanel />
        <div className="border-x border-black-800 flex-1 flex flex-col">
          <div className="h-16 p-4 flex items-center gap-2 border-b border-black-800">
            <SearchBar />
          </div>
          <ContentPanel />
          <div className="h-16 p-4 flex items-center gap-2 border-t border-black-800">

          </div>
        </div>
        <RightPanel />
      </div>

      <DragOverlay style={{ zIndex: 1000, pointerEvents: 'none' }}>
        <DragOverlayContent
          activeId={activeId}
          draggedGroup={draggedGroup}
          draggedTab={draggedTab}
          draggedSavedTab={draggedSavedTab}
        />
      </DragOverlay>

      <UndoToastContainer />
    </DndContext>
  )
}

function NewTabPage() {
  const hydrated = useHydrated();

  if (!hydrated) return <LoadingScreen />;

  return (
    <ErrorBoundary>
      <NewTabPageContent />
    </ErrorBoundary>
  )
}

export default NewTabPage