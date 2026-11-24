import { ContentPanel, LeftPanel, ProfilePanel, RightPanel, Drawer, DragOverlayContent } from "~src/components"
import { Icon } from "~src/components/ui/icon"
import { Menu, PanelRight } from "lucide-react"
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
import { useShellShapeMirror } from "~src/hooks/useShellShapeMirror"
import { useShellLayout } from "~src/hooks/useMediaQuery"
import { useBackgroundNotices } from "~src/hooks/useBackgroundNotices"
import { useUIStore } from "~src/store/useUIStore"
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore"

function MenuIcon() {
  return <Icon icon={Menu} size="lg" />
}

function OpenedTabsIcon() {
  return <Icon icon={PanelRight} size="lg" />
}

/**
 * Authenticated (or guest / has-tabs) app chrome: DnD shell, drawers, settings
 * route swap, and background-notice bridges.
 */
export function AppShell() {
  useTheme()
  useShellShapeMirror()
  useKeyboardShortcuts()
  useBackgroundNotices()
  const {
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragMove,
    handleDragCancel,
    collisionDetectionStrategy,
    activeId,
    draggedTab,
    draggedSavedTab,
    draggedGroup,
    draggedContainer,
  } = useDragAndDrop()

  const { leftInline, rightInline } = useShellLayout()
  const {
    leftDrawerOpen, rightDrawerOpen,
    setLeftDrawerOpen, setRightDrawerOpen,
    toggleLeftDrawer, toggleRightDrawer,
  } = useUIStore()
  const inSettings = isSettingsRoute(useRoute())
  // With no spaces the tree panel has nothing to show, so the clean slate
  // spans from the rail to Opened Tabs (TASK-98).
  const noSpaces = useSavedSpacesStore((s) => s.savedSpaces.length === 0)

  return (
    <DndContext
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragMove={handleDragMove}
      onDragCancel={handleDragCancel}
      collisionDetection={collisionDetectionStrategy}
    >
      <div className="flex h-screen w-screen bg-black-900 overflow-hidden">
        <ProfilePanel />

        {inSettings ? (
          // Settings reuses the tab-manager shell: nav in the LeftPanel slot,
          // content in the ContentPanel slot. The opened-tabs panel is hidden.
          <>
            <SettingsNav />
            <main className="border-x border-line flex-1 flex flex-col min-w-0">
              <SettingsContent />
            </main>
          </>
        ) : (
          <>
            {noSpaces ? null : leftInline ? (
              <LeftPanel />
            ) : (
              <Drawer id="navigation-drawer" side="left" open={leftDrawerOpen} onClose={() => setLeftDrawerOpen(false)}>
                <LeftPanel />
              </Drawer>
            )}

            <div className="border-x border-line flex-1 flex flex-col min-w-0">
              <header className="h-16 px-3 sm:px-5 flex items-center justify-between gap-2 border-b border-line shrink-0">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {!leftInline && !noSpaces && (
                    <IconButton onClick={toggleLeftDrawer} size="lg" className="shrink-0" tooltip="Spaces & navigation" tooltipSide="bottom" aria-label="Toggle navigation" aria-haspopup="dialog" aria-expanded={leftDrawerOpen} aria-controls={leftDrawerOpen ? "navigation-drawer" : undefined}>
                      <MenuIcon />
                    </IconButton>
                  )}
                  <SearchBar />
                  {!rightInline && (
                    <IconButton onClick={toggleRightDrawer} size="lg" className="shrink-0" tooltip="Opened tabs" tooltipSide="bottom" aria-label="Toggle opened tabs" aria-haspopup="dialog" aria-expanded={rightDrawerOpen} aria-controls={rightDrawerOpen ? "opened-tabs-drawer" : undefined}>
                      <OpenedTabsIcon />
                    </IconButton>
                  )}
                </div>
                <SyncStatusIndicator />
              </header>
              <main className="flex-1 flex flex-col min-h-0 min-w-0">
                <ContentPanel />
              </main>
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
          draggedContainer={draggedContainer}
        />
      </DragOverlay>

      <SaveAllDialog />
      <ShortcutsDialog />
      <Toaster />
    </DndContext>
  )
}
