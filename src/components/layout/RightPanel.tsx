import { useState, useRef, useCallback } from "react"
import { useDraggable } from "@dnd-kit/core"
import { DragHandleIcon } from "../icons/DragHandleIcon"
import { FaviconImg } from "../FaviconImg"
import { SaveSessionModal } from "../SaveSessionModal"
import { useWindows } from "~src/hooks/useWindows"
import { IconButton } from "~src/components/ui/button"
import { Tooltip, TooltipTrigger, TooltipContent } from "~src/components/ui/tooltip"
import { BookmarkCheck } from "lucide-react"
import { useSavedUrlIndex } from "~src/hooks/useSavedUrlIndex"
import { describeSaved, normalizeUrl, type SavedLocation } from "~src/lib/savedUrlIndex"

const OpenedTab = ({ tab, windowId, saved }: { tab: chrome.tabs.Tab, windowId: number, saved?: SavedLocation[] }) => {
  const savedLabel = describeSaved(saved)
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
      <div
        {...attributes}
        {...listeners}
        className="opacity-0 group-hover/tab:opacity-40 hover:!opacity-80 cursor-grab active:cursor-grabbing p-0.5 rounded transition-opacity shrink-0"
        title="Drag to save"
      >
        <DragHandleIcon className="w-3.5 h-3.5 text-white" />
      </div>

      <div
        className="flex gap-2.5 items-center flex-1 cursor-pointer overflow-hidden"
        onClick={() => onTabClick(tab, windowId)}
      >
        <FaviconImg src={tab.favIconUrl} alt={tab.title} />
        <div className="flex flex-col min-w-0">
          <span className="text-white/80 text-xs font-sans truncate">{tab.title}</span>
          <span className="text-white/30 text-[10px] font-sans truncate">{tab.url?.replace(/^https?:\/\//, '')}</span>
        </div>
      </div>

      {/* Already saved somewhere (TASK-4): a quiet mark, where it lives on hover. */}
      {savedLabel && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span role="img" aria-label={savedLabel} tabIndex={0} className="shrink-0 rounded text-white/45 outline-none focus-visible:ring-1 focus-visible:ring-ring">
              <BookmarkCheck className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            </span>
          </TooltipTrigger>
          <TooltipContent>{savedLabel}</TooltipContent>
        </Tooltip>
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
    <div className="w-80 h-full flex flex-col">
      {/* Header */}
      <div className="h-16 px-4 flex items-center gap-2 border-b border-black-800 shrink-0">
        <h2 className="text-white/80 font-sans text-sm font-medium flex-1">Opened Tabs</h2>
      </div>

      {/* Tab list */}
      <div ref={parentRef} className="flex-1 overflow-y-auto">
        {windows.map((window, index) => {
          const windowId = window.id!
          const isCollapsed = collapsed.has(windowId)
          const tabs = window.tabs ?? []

          return (
            <div key={windowId}>
              {/* Window header */}
              <div className="sticky top-0 z-10 bg-black-900 border-b border-black-800 h-14 px-4 flex items-center gap-2">
                <IconButton variant="subtle" onClick={() => toggleWindow(windowId)}>
                  <svg
                    className={`w-3.5 h-3.5 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </IconButton>
                <span className="text-xs text-white/50 font-sans flex-1">
                  Window {index + 1}
                  <span className="text-white/25 ml-1.5">{tabs.length} tabs</span>
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <IconButton variant="subtle" onClick={() => handleSaveSession(tabs)}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                      </svg>
                    </IconButton>
                  </TooltipTrigger>
                  <TooltipContent>Save this window as a group</TooltipContent>
                </Tooltip>
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
    </div>
  )
}
