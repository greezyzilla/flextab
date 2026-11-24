import { useState, useRef, useCallback, useEffect, type ReactNode } from "react"
import { Icon } from "~src/components/ui/icon"
import { cn } from "~src/lib/utils"
import { toast } from "sonner"
import { ActionSlot } from "~src/components/ui/row-actions"
import { showUndoToast } from "~src/components/ui/sonner"
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore"
import { captureTabs, closeSavedTabs, isCaptureFailure, loadCloseAfter, loadDefaultDestination, recordClosed, reopenTabs, undoCapture } from "~src/services/capture"
import { isSavableTabUrl } from "~src/services/saveTabsAsGroup"
import { describeAlsoSaved } from "~src/lib/savedUrlIndex"
import { revealInWorkspace } from "~src/services/reveal"
import { useDraggable, useDroppable } from "@dnd-kit/core"
import { OPEN_PANEL_ZONE, OPEN_TAB_ZONE, OPEN_WINDOW_ZONE, isNoMove, moveOpenTab, moveOpenTabToNewWindow, previewWindows } from "~src/services/moveOpenTab"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "~src/components/ui/dropdown-menu"
import { useOpenTabPreview } from "~src/store/useOpenTabPreview"
import type { OpenTabDragData, OpenTabZoneData } from "~src/hooks/useDragAndDrop"
import { FaviconImg } from "../FaviconImg"
import { TabUrl } from "../TabUrl"
import { isFlexTabPage, openTabRowText } from "~src/lib/openTabText"
import { SaveSessionModal } from "../SaveSessionModal"
import { useWindows } from "~src/hooks/useWindows"
import { IconButton } from "~src/components/ui/button"
import { ArrowRightLeft, BookmarkPlus, Check, ChevronRight, Loader2, LocateFixed, X } from "lucide-react"
import { useSavedUrlIndex } from "~src/hooks/useSavedUrlIndex"
import { describeSaved, normalizeUrl, type SavedLocation } from "~src/lib/savedUrlIndex"
import { DragHandle } from "~src/components/ui/drag-handle"
import { RowOverlay } from "~src/components/ui/row-overlay"
import { DENSITY_ROW_PY } from "~src/components/ui/tree-row-button"
import { storeShellShape, windowsShape } from "~src/lib/shellShape"
import { storeShellSkeletonMarkup } from "./ShellSkeleton"

function flexTabIcon(): string | undefined {
  const icon = chrome.runtime?.getManifest?.().icons?.["128"]
  return icon ? chrome.runtime.getURL(icon) : undefined
}
/** The one save mark: a row's Save and a window's Save draw the same icon at the same size. */
const SaveIcon = () => <Icon icon={BookmarkPlus} size="sm" />


/**
 * One open tab. What people do with an open tab here is one click
 * each: go to it (the row), save it (or, once saved, go to where it is), close
 * it, or drag it to a place. Saving closes it too when Settings › Saving says
 * so ("Close after dragging a tab in"); every save and close can be undone.
 * Pages that can't be saved (browser, extension, local) can't be saved, but
 * can still be dragged to another spot or window.
 */
/** A window a tab can be moved to without dragging: its name, as its header shows it, and where its end is. */
type MoveTarget = { id: number; label: string; end: number }

const OpenedTab = ({ tab, windowId, windowLabel, saved, closeAfterSave, targets = [], ownTabs = 0 }: { tab: chrome.tabs.Tab, windowId: number, windowLabel: string, saved?: SavedLocation[], closeAfterSave: boolean, targets?: MoveTarget[], ownTabs?: number }) => {
  const savedLabel = describeSaved(saved)
  const savable = isSavableTabUrl(tab.url)
  const flexTab = isFlexTabPage(tab.url)
  // A tab Chrome has no title for is named by its site, its address under it;
  // the address line shows only when it says something the name doesn't. A
  // FlexTab page is named for which page it is, "FlexTab" under it.
  const text = openTabRowText(tab)
  const name = text.name
  const address = text.address
  const loading = tab.status === "loading"
  // A pinned tab is never closed by saving, so its button never says it will be.
  const closes = closeAfterSave && !tab.pinned

  const save = async () => {
    const { activeSpaceId, activeProjectId, activeCategoryId } = useSavedSpacesStore.getState()
    const destination = await loadDefaultDestination({ spaceId: activeSpaceId, projectId: activeProjectId, categoryId: activeCategoryId })
    const result = await captureTabs([tab], destination, { dedupe: true })
    if (isCaptureFailure(result)) { toast(`Can't save “${name}”`); return }
    if (!result.tabIds.length) { toast("Already saved there"); return }
    const closed = await loadCloseAfter("drag") ? await closeSavedTabs([tab]) : []
    const receipt = { ...result, closed }
    showUndoToast(closed.length ? `Saved and closed “${name}”` : `Saved “${name}”`, () => void undoCapture(receipt), 5000,
      describeAlsoSaved(result.alsoIn ?? []) ?? undefined)
  }
  const close = async () => {
    await chrome.tabs.remove(tab.id!)
    const closed = recordClosed({ windowId, index: tab.index ?? 0, url: tab.url ?? "" })
    showUndoToast(`Closed “${name}”`, () => void reopenTabs([closed]))
  }
  const showSaved = () => {
    const at = saved?.[0]
    if (at) revealInWorkspace({ spaceId: at.spaceId, projectId: at.projectId, categoryId: at.categoryId, flash: { kind: "group", id: at.groupId } })
  }
  const onTabClick = () => {
    chrome.tabs.update(tab.id!, { active: true })
    chrome.windows.update(windowId, { focused: true })
  }

  // Any tab can be dragged: to another spot or window here, or, if
  // it can be saved, into the workspace (an unsavable one is refused there).
  // Its own window and index, even while it is shown in another window's list.
  const place: OpenTabDragData = { windowId: tab.windowId ?? windowId, index: tab.index ?? 0, name }
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: tab.id!, data: place })
  // Dropped on this row, a tab lands beside it, on the side the line shows.
  const zone = `${OPEN_TAB_ZONE}${tab.id}`
  const { setNodeRef: setDropRef } = useDroppable({ id: zone, data: { windowId: place.windowId, index: place.index, label: windowLabel } satisfies OpenTabZoneData })
  // Save and Close appear on hover/focus only, so at rest a row is just the
  // page. They take their room then (the title ellipsizes), never cover text.
  const onHover = "hidden group-hover/tab:flex group-focus-within/tab:flex"

  // The non-drag move (WCAG 2.5.7): another window, or a new one. A
  // window's only tab gains nothing from a new window, so it is offered only
  // when its window has more tabs. While the menu is open the row's actions
  // stay up, since focus has left the row for the menu.
  const [moveOpen, setMoveOpen] = useState(false)
  const others = targets.filter((w) => w.id !== place.windowId)
  const canNewWindow = ownTabs > 1
  const moveTo = async (w: MoveTarget) => {
    const undo = await moveOpenTab(tab.id!, place, { windowId: w.id, index: w.end })
    if (undo) showUndoToast(`Moved “${name}” to ${w.label}`, () => void undo())
  }
  const moveToNewWindow = async () => {
    const undo = await moveOpenTabToNewWindow(tab.id!, place)
    if (undo) showUndoToast(`Moved “${name}” to a new window`, () => void undo())
  }

  return (
    // A plain list row, as in the sidebar tree: no box, a light fill on hover.
    // The whole row goes to the tab; the few controls sit above that.
    <div
      className={`relative flex gap-2.5 items-center w-full rounded-md px-3 ${DENSITY_ROW_PY} text-left group/tab transition-colors hover:bg-ink/[0.04] focus-within:bg-ink/[0.04]`}
      ref={(el) => { setNodeRef(el); setDropRef(el) }}
      data-open-zone={zone}
      // While dragged, the row stays where it is, dimmed; the card that
      // follows the pointer is the overlay. A row that moved away left a
      // blank slot, which read as a place to drop.
      style={{ opacity: isDragging ? 0.5 : 1 }}
    >
      <RowOverlay aria-label={`Go to ${name}`} onClick={onTabClick} />

      {/* Favicon slot doubles as the drag handle on hover/focus, as on saved
          tabs, so no empty gutter sits in front of the favicon. */}
      <span className="relative w-5 h-5 shrink-0 pointer-events-none">
        <DragHandle reveal="group-hover/tab:opacity-100" {...attributes} {...listeners} aria-label={`Drag ${name}`} />
        <span className="relative grid h-5 w-5 place-items-center transition-opacity group-hover/tab:opacity-0 peer-focus-visible:opacity-0">
          {loading ? <Icon icon={Loader2} size="md" className="animate-spin motion-reduce:animate-none text-fg-subtle" label="Loading" />
            : flexTab ? <img src={flexTabIcon()} alt="" className="w-5 h-5" />
            : <FaviconImg src={tab.favIconUrl} alt="" />}
          {/* Saved: the popup's flag, a green check on the page's icon. */}
          {savedLabel && (
            <span role="img" aria-label={savedLabel} className="absolute -bottom-1 -right-1 grid h-3 w-3 place-items-center rounded-full bg-success ring-2 ring-black-900">
              <Icon icon={Check} size="badge" className="text-black-900" />
            </span>
          )}
        </span>
      </span>

      <span className="flex flex-col flex-1 min-w-0 pointer-events-none">
        <span className="flex items-center gap-1 min-w-0">
          {/* A page that can't be saved reads quieter, so it's clear before you try. */}
          <span className={`${savable ? "text-fg" : "text-fg-subtle"} text-xs font-sans truncate`}>{name}</span>
        </span>
        {address && <TabUrl url={address} />}
      </span>

      <span className={`${moveOpen ? "flex" : onHover} relative z-10 shrink-0 items-center gap-0.5 -my-1`}>
        {/* Actions, on hover/focus: a saved tab can be shown where it is saved; an unsaved one saved. */}
        {savedLabel ? (
          <IconButton aria-label={`${savedLabel}. Show in workspace`} tooltip="Show in workspace" onClick={showSaved}>
            <Icon icon={LocateFixed} size="sm" />
          </IconButton>
        ) : savable && (
          <IconButton aria-label={`${closes ? "Save and close" : "Save"} ${name}`} tooltip={closes ? "Save and close" : "Save"} onClick={() => void save()}>
            <SaveIcon />
          </IconButton>
        )}
        {(others.length > 0 || canNewWindow) && (
          <DropdownMenu open={moveOpen} onOpenChange={setMoveOpen}>
            <DropdownMenuTrigger asChild>
              <IconButton aria-label={`Move ${name} to another window`} tooltip="Move to window">
                <Icon icon={ArrowRightLeft} size="sm" />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {others.map((w) => (
                <DropdownMenuItem key={w.id} onSelect={() => void moveTo(w)}>{w.label}</DropdownMenuItem>
              ))}
              {others.length > 0 && canNewWindow && <DropdownMenuSeparator />}
              {canNewWindow && <DropdownMenuItem onSelect={() => void moveToNewWindow()}>New window</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <IconButton aria-label={`Close ${name}`} tooltip="Close tab" onClick={() => void close()}>
          <Icon icon={X} size="sm" />
        </IconButton>
      </span>
    </div>
  )
}

/**
 * A window's sticky header: a tab dropped on it goes to the end of
 * that window. It lights up like a group card taking a tab, unless the drop
 * would leave the tab where it is.
 */
function WindowHeader({ windowId, tabCount, label, children }: { windowId: number, tabCount: number, label: string, children: ReactNode }) {
  const { setNodeRef, isOver, active } = useDroppable({ id: `${OPEN_WINDOW_ZONE}${windowId}`, data: { windowId, index: tabCount, label } satisfies OpenTabZoneData })
  const from = active?.data.current as OpenTabDragData | undefined
  const takes = isOver && typeof active?.id === "number" && !!from && !isNoMove(from, { windowId, index: tabCount })
  return (
    <div ref={setNodeRef} className="sticky top-0 z-10 bg-black-900 border-b border-line h-14 pl-4 pr-6 flex items-center gap-2">
      {takes && <span aria-hidden data-window-drop className="pointer-events-none absolute inset-0 -z-10 border" style={{ borderColor: "var(--accent)", backgroundColor: "var(--accent-subtle)" }} />}
      {children}
    </div>
  )
}

/** Settings › Saving's "Close after dragging a tab in", kept current while the panel is open. */
function useCloseAfterDrag(): boolean {
  const [on, setOn] = useState(false)
  useEffect(() => {
    let alive = true
    const read = () => void loadCloseAfter("drag").then((v) => { if (alive) setOn(v) })
    read()
    const onChanged = (changes: Record<string, unknown>, area: string) => { if (area === "local" && "flextab_close_after_drag" in changes) read() }
    chrome.storage.onChanged.addListener(onChanged)
    return () => { alive = false; chrome.storage.onChanged.removeListener(onChanged) }
  }, [])
  return on
}

export function RightPanel() {
  const { windows } = useWindows({ populate: true })
  // While an open tab is dragged here, the lists show it where it would land.
  const preview = useOpenTabPreview((s) => s.preview)
  const shown = previewWindows(windows, preview)
  const parentRef = useRef<HTMLDivElement | null>(null)
  // The whole list: an open tab let go here moves in the browser, never into the workspace.
  const { setNodeRef: setPanelRef } = useDroppable({ id: OPEN_PANEL_ZONE })
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  const [saveModal, setSaveModal] = useState<{ tabs: chrome.tabs.Tab[] } | null>(null)
  const savedIndex = useSavedUrlIndex()
  const closeAfterSave = useCloseAfterDrag()
  // The tab this page runs in: you are looking at it, so it isn't listed.
  const [selfId, setSelfId] = useState<number | undefined>()
  useEffect(() => { void chrome.tabs.getCurrent?.().then((t) => setSelfId(t?.id)).catch(() => {}) }, [])
  // The loading shell draws as many windows and tabs as were listed here (lib/shellShape.ts).
  useEffect(() => {
    const t = setTimeout(() => {
      storeShellShape({ windows: windowsShape(windows.map((w) => (w.tabs ?? []).filter((x) => x.id !== selfId).length)) })
      storeShellSkeletonMarkup()
    }, 300)
    return () => clearTimeout(t)
  }, [windows, selfId])

  const toggleWindow = useCallback((windowId: number) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(windowId)) next.delete(windowId)
      else next.add(windowId)
      return next
    })
  }, [])

  const handleSaveSession = useCallback((tabs: chrome.tabs.Tab[]) => {
    setSaveModal({ tabs })
  }, [])

  return (
    <aside aria-label="Opened tabs" className="w-80 h-full flex flex-col">
      {/* Header */}
      <div className="h-16 px-4 flex items-center gap-2 border-b border-line shrink-0">
        <h2 className="text-fg font-sans text-sm font-medium flex-1">Opened Tabs</h2>
      </div>

      {/* Tab list */}
      <div ref={(el) => { parentRef.current = el; setPanelRef(el) }} className="flex-1 overflow-y-auto">
        {(() => {
          // Every window as a place to move a tab to: its name, and its real end
          // (the hidden FlexTab tab counts there, as for a drop on its header).
          const targets: MoveTarget[] = shown.map((w, i) => ({
            id: w.id!, label: `Window ${i + 1}`,
            end: windows.find((x) => x.id === w.id)?.tabs?.length ?? 0,
          }))
          return shown.map((window, index) => {
          const windowId = window.id!
          const isCollapsed = collapsed.has(windowId)
          const tabs = (window.tabs ?? []).filter((t) => t.id !== selfId)
          const label = `Window ${index + 1}`

          return (
            // A line between windows, on the section (not the sticky header), so a
            // header stuck under "Opened Tabs" never doubles that line.
            <div key={windowId} className={index > 0 ? "border-t border-line" : undefined}>
              {/* Window header. pr-6 + ActionSlot put its save button in the
                  same column as the rows' trailing slot (p-3 list + px-3 row). */}
              {/* The hidden FlexTab tab counts too: the end is past every real tab. */}
              <WindowHeader windowId={windowId} tabCount={windows.find((w) => w.id === windowId)?.tabs?.length ?? 0} label={label}>
                <IconButton variant="subtle" onClick={() => toggleWindow(windowId)}
                  aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} Window ${index + 1}`} aria-expanded={!isCollapsed}>
                  <Icon icon={ChevronRight} size="sm" className={cn("transition-transform", !isCollapsed && "rotate-90")} />
                </IconButton>
                <span className="text-xs text-fg-subtle font-sans flex-1">
                  Window {index + 1}
                  <span className="text-fg-subtle ml-1.5">{tabs.length} {tabs.length === 1 ? "tab" : "tabs"}</span>
                </span>
                <ActionSlot>
                <IconButton onClick={() => handleSaveSession(tabs)} aria-label={`Save Window ${index + 1} as a group`} tooltip="Save this window as a group">
                  {/* The same mark as a row's Save: saving, not downloading. */}
                  <SaveIcon />
                </IconButton>
                </ActionSlot>
              </WindowHeader>

              {/* Tabs */}
              {!isCollapsed && (
                <div className="flex flex-col gap-0.5 p-3">
                  {tabs.map(tab => (
                    <OpenedTab key={tab.id} tab={tab} windowId={windowId} windowLabel={label} saved={savedIndex.get(normalizeUrl(tab.url))} closeAfterSave={closeAfterSave}
                      targets={targets} ownTabs={windows.find((w) => w.id === (tab.windowId ?? windowId))?.tabs?.length ?? 0} />
                  ))}
                </div>
              )}
            </div>
          )
          })
        })()}
      </div>

      {saveModal && (
        <SaveSessionModal
          tabs={saveModal.tabs}
          onClose={() => setSaveModal(null)}
        />
      )}
    </aside>
  )
}
