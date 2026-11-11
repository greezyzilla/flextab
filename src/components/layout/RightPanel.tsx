import { useState, useRef, useCallback } from "react"
import { toast } from "sonner"
import { ActionSlot, RowActions } from "~src/components/ui/row-actions"
import { PickDestinationDialog } from "~src/components/PickDestinationDialog"
import { showUndoToast } from "~src/components/ui/sonner"
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore"
import { captureTabs, isCaptureFailure, undoCapture } from "~src/services/capture"
import { isSavableTabUrl } from "~src/services/saveTabsAsGroup"
import { describeAlsoSaved } from "~src/lib/savedUrlIndex"
import { useDraggable } from "@dnd-kit/core"
import { DragHandleIcon } from "../icons/DragHandleIcon"
import { FaviconImg } from "../FaviconImg"
import { SaveSessionModal } from "../SaveSessionModal"
import { useWindows } from "~src/hooks/useWindows"
import { IconButton } from "~src/components/ui/button"
import { BookmarkCheck } from "lucide-react"
import { useSavedUrlIndex } from "~src/hooks/useSavedUrlIndex"
import { describeSaved, normalizeUrl, type SavedLocation } from "~src/lib/savedUrlIndex"

const OpenedTab = ({ tab, windowId, saved }: { tab: chrome.tabs.Tab, windowId: number, saved?: SavedLocation[] }) => {
  const savedLabel = describeSaved(saved)
  const [saving, setSaving] = useState(false)
  const { activeSpaceId, activeProjectId, activeCategoryId } = useSavedSpacesStore()

  // "Save to…": the non-drag way to save one open tab (TASK-5).
  const saveTo = async (target: Parameters<typeof captureTabs>[1]) => {
    const result = await captureTabs([tab], target, { dedupe: true })
    if (isCaptureFailure(result)) { toast(`Can't save “${tab.title}”`); return }
    if (!result.tabIds.length) { toast("Already saved there"); return }
    showUndoToast(`Saved “${tab.title}”`, () => void undoCapture(result), 5000, describeAlsoSaved(result.alsoIn ?? []) ?? undefined)
  }
  const onTabClick = (tab: chrome.tabs.Tab, windowId: number) => {
    chrome.tabs.update(tab.id!, { active: true })
    chrome.windows.update(windowId, { focused: true })
  }

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: tab.id!,
  })

  return (
    <div
      className="flex gap-2.5 items-center w-full rounded-lg bg-black-800 hover:bg-black-700 px-3 py-2 text-left group/tab transition-colors"
      ref={setNodeRef}
      style={{
        transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
        opacity: isDragging ? 0.5 : 1,
      }}
    >
      {/* Favicon slot doubles as the drag handle on hover/focus, as on saved
          tabs, so no empty gutter sits in front of the favicon (TASK-5). */}
      <span className="relative w-5 h-5 shrink-0">
        <FaviconImg src={tab.favIconUrl} alt="" />
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Drag ${tab.title || "tab"} to save it`}
          title="Drag to save"
          className="absolute -inset-0.5 flex items-center justify-center rounded bg-black-700 opacity-0 group-hover/tab:opacity-100 focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-ring outline-none cursor-grab active:cursor-grabbing transition-opacity"
        >
          <DragHandleIcon className="w-3.5 h-3.5 text-fg-muted" />
        </button>
      </span>

      <button
        type="button"
        aria-label={`Go to ${tab.title || tab.url}`}
        className="flex flex-col flex-1 min-w-0 cursor-pointer overflow-hidden text-left rounded outline-none focus-visible:ring-1 focus-visible:ring-ring"
        onClick={() => onTabClick(tab, windowId)}
      >
        <span className="text-fg text-xs font-sans truncate">{tab.title}</span>
        <span className="text-fg-subtle text-[10px] font-sans truncate">{tab.url?.replace(/^https?:\/\//, '')}</span>
      </button>

      {/* The row's one trailing slot: the saved mark (TASK-4) rests there,
          "⋯" takes its place on hover/focus and its menu says where. */}
      <RowActions
        label={`Actions for ${tab.title || "tab"}`}
        reveal="opacity-0 group-hover/tab:opacity-100 group-focus-within/tab:opacity-100"
        conceal="group-hover/tab:opacity-0 group-focus-within/tab:opacity-0"
        rest={savedLabel ? (
          <span role="img" aria-label={savedLabel} title={savedLabel} className="text-fg-subtle">
            <BookmarkCheck className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
          </span>
        ) : undefined}
        note={savedLabel ?? undefined}
        items={isSavableTabUrl(tab.url) ? [{ label: "Save to…", onSelect: () => setSaving(true) }] : []}
      />
      {saving && (
        <PickDestinationDialog
          title="Save tab"
          description={`Save “${tab.title || tab.url}” to a group.`}
          groupLevel
          initial={{ spaceId: activeSpaceId ?? "", projectId: activeProjectId ?? "", categoryId: activeCategoryId ?? "" }}
          confirmLabel="Save tab"
          onConfirm={(target) => void saveTo(target)}
          onClose={() => setSaving(false)}
        />
      )}
    </div>
  )
}

export function RightPanel() {
  const { windows } = useWindows({ populate: true })
  const parentRef = useRef<HTMLDivElement>(null)
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  const [saveModal, setSaveModal] = useState<{ tabs: chrome.tabs.Tab[] } | null>(null)
  const savedIndex = useSavedUrlIndex()

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
      <div ref={parentRef} className="flex-1 overflow-y-auto">
        {windows.map((window, index) => {
          const windowId = window.id!
          const isCollapsed = collapsed.has(windowId)
          const tabs = window.tabs ?? []

          return (
            <div key={windowId}>
              {/* Window header. pr-6 + ActionSlot put its save button in the
                  same column as the rows' trailing slot (p-3 list + px-3 row). */}
              <div className="sticky top-0 z-10 bg-black-900 border-b border-line h-14 pl-4 pr-6 flex items-center gap-2">
                <IconButton variant="subtle" onClick={() => toggleWindow(windowId)}
                  aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} Window ${index + 1}`} aria-expanded={!isCollapsed}>
                  <svg
                    className={`w-3.5 h-3.5 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </IconButton>
                <span className="text-xs text-fg-subtle font-sans flex-1">
                  Window {index + 1}
                  <span className="text-fg-subtle ml-1.5">{tabs.length} tabs</span>
                </span>
                <ActionSlot>
                <IconButton onClick={() => handleSaveSession(tabs)} aria-label={`Save Window ${index + 1} as a group`} tooltip="Save this window as a group">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                </IconButton>
                </ActionSlot>
              </div>

              {/* Tabs */}
              {!isCollapsed && (
                <div className="flex flex-col gap-1.5 p-3">
                  {tabs.map(tab => (
                    <OpenedTab key={tab.id} tab={tab} windowId={windowId} saved={savedIndex.get(normalizeUrl(tab.url))} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
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
