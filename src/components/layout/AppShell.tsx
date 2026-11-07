import { ContentPanel, LeftPanel, ProfilePanel, RightPanel, Drawer, DragOverlayContent } from "~src/components"
import { SearchBar } from "~src/components/SearchBar"
import { SyncStatusIndicator } from "~src/components/SyncStatusIndicator"
import { Toaster } from "~src/components/ui/sonner"
import { SaveAllDialog } from "~src/components/SaveAllDialog"
import { ShortcutsDialog } from "~src/components/ShortcutsDialog";
import { SettingsNav, SettingsContent, isSettingsRoute } from "~src/components/SettingsPage"
import { useRoute } from "~src/lib/route"
import { IconButton } from "~src/components/ui/button"
import { DndContext, DragOverlay } from "@dnd-kit/core"
import { useDragAndDrop } from "~src/hooks/useDragAndDrop"
import { useKeyboardShortcuts } from "~src/hooks/useKeyboardShortcuts"
import { useTheme } from "~src/hooks/useTheme"
import { useShellLayout } from "~src/hooks/useMediaQuery"
import { useBackgroundNotices } from "~src/hooks/useBackgroundNotices"
import { useUIStore } from "~src/store/useUIStore"

function MenuIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
    </svg>
  )
}

function OpenedTabsIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m-3.75 0h13.5A2.25 2.25 0 0 0 21 17.25V6.75A2.25 2.25 0 0 0 18.75 4.5H5.25A2.25 2.25 0 0 0 3 6.75v10.5A2.25 2.25 0 0 0 5.25 19.5Z" />
    </svg>
  )
}

/**
 * Authenticated (or guest / has-tabs) app chrome: DnD shell, drawers, settings
 * route swap, and background-notice bridges.
 */
export function AppShell() {
  useTheme()
  useKeyboardShortcuts()
  useBackgroundNotices()
  const {
    handleDragStart,
    handleDragEnd,
    collisionDetectionStrategy,
    activeId,
    draggedTab,
    draggedSavedTab,
    draggedGroup
  } = useDragAndDrop()

  const { leftInline, rightInline } = useShellLayout()
  const {
    leftDrawerOpen, rightDrawerOpen,
    setLeftDrawerOpen, setRightDrawerOpen,
    toggleLeftDrawer, toggleRightDrawer,
  } = useUIStore()
  const inSettings = isSettingsRoute(useRoute())

  return (
    <DndContext
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      collisionDetection={collisionDetectionStrategy}
    >
      <div className="flex h-screen w-screen bg-black-900 overflow-hidden">
        <ProfilePanel />

        {inSettings ? (
          // Settings reuses the tab-manager shell: nav in the LeftPanel slot,
          // content in the ContentPanel slot. The opened-tabs panel is hidden.
          <>
            <SettingsNav />
            <div className="border-x border-black-800 flex-1 flex flex-col min-w-0">
              <SettingsContent />
            </div>
          </>
        ) : (
          <>
            {leftInline ? (
              <LeftPanel />
            ) : (
              <Drawer id="navigation-drawer" side="left" open={leftDrawerOpen} onClose={() => setLeftDrawerOpen(false)}>
                <LeftPanel />
              </Drawer>
            )}

            <div className="border-x border-black-800 flex-1 flex flex-col min-w-0">
              <div className="h-16 px-3 sm:px-5 flex items-center justify-between gap-2 border-b border-black-800 shrink-0">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {!leftInline && (
                    <IconButton onClick={toggleLeftDrawer} className="h-9 w-9 shrink-0" title="Spaces & navigation" aria-label="Toggle navigation" aria-haspopup="dialog" aria-expanded={leftDrawerOpen} aria-controls={leftDrawerOpen ? "navigation-drawer" : undefined}>
                      <MenuIcon />
                    </IconButton>
                  )}
                  <SearchBar />
                  {!rightInline && (
                    <IconButton onClick={toggleRightDrawer} className="h-9 w-9 shrink-0" title="Opened tabs" aria-label="Toggle opened tabs" aria-haspopup="dialog" aria-expanded={rightDrawerOpen} aria-controls={rightDrawerOpen ? "opened-tabs-drawer" : undefined}>
                      <OpenedTabsIcon />
                    </IconButton>
                  )}
                </div>
                <SyncStatusIndicator />
              </div>
              <ContentPanel />
            </div>

            {rightInline ? (
              <RightPanel />
            ) : (
              <Drawer id="opened-tabs-drawer" side="right" open={rightDrawerOpen} onClose={() => setRightDrawerOpen(false)}>
                <RightPanel />
              </Drawer>
            )}
          </>
        )}
      </div>

      <DragOverlay style={{ zIndex: 1000, pointerEvents: 'none' }}>
        <DragOverlayContent
          activeId={activeId}
          draggedGroup={draggedGroup}
          draggedTab={draggedTab}
          draggedSavedTab={draggedSavedTab}
        />
      </DragOverlay>

      <SaveAllDialog />
      <ShortcutsDialog />
      <Toaster />
    </DndContext>
  )
}
