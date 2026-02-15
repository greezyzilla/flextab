import { ContentPanel, LeftPanel, ProfilePanel, RightPanel, DragOverlayContent } from "~src/components"
import "../../style.css"
import "./style.css"

import { DndContext, DragOverlay } from "@dnd-kit/core"
import { useDragAndDrop } from "~src/hooks/useDragAndDrop"

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
    </DndContext>
  )
}

function NewTabPage() {
  return (
    <NewTabPageContent />
  )
}

export default NewTabPage