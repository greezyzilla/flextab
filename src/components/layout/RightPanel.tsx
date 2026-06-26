import { useState, useRef, useCallback } from "react"
import { useDraggable } from "@dnd-kit/core"
import { DragHandleIcon } from "../icons/DragHandleIcon"
import { FaviconImg } from "../FaviconImg"
import { useWindows } from "~src/hooks/useWindows"
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore"
import { v7 as uuidv7 } from "uuid"
import { faviconToDataUrl } from "~src/utils/favicon"
import { Modal } from "~src/components/Modal"

const OpenedTab = ({ tab, windowId }: { tab: chrome.tabs.Tab, windowId: number }) => {
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
    </div>
  )
}

// --- Save Session Modal ---

function SaveSessionModal({
  tabs,
  onClose,
}: {
  tabs: chrome.tabs.Tab[]
  onClose: () => void
}) {
  const { savedSpaces, activeSpaceId, activeProjectId, activeCategoryId, addSavedGroup, addSavedTabsBatch } = useSavedSpacesStore()
  const now = new Date()
  const defaultName = `${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`

  const [name, setName] = useState(defaultName)
  const [spaceId, setSpaceId] = useState(activeSpaceId ?? savedSpaces[0]?.id ?? "")
  const [projectId, setProjectId] = useState(activeProjectId ?? "")
  const [categoryId, setCategoryId] = useState(activeCategoryId ?? "")
  const [saving, setSaving] = useState(false)

  const selectedSpace = savedSpaces.find(s => s.id === spaceId)
  const projects = selectedSpace?.projects ?? []
  const selectedProject = projects.find(p => p.id === projectId)
  const categories = selectedProject?.categories ?? []

  const handleSpaceChange = (id: string) => {
    setSpaceId(id)
    const space = savedSpaces.find(s => s.id === id)
    const firstProject = space?.projects[0]
    setProjectId(firstProject?.id ?? "")
    setCategoryId(firstProject?.categories[0]?.id ?? "")
  }

  const handleProjectChange = (id: string) => {
    setProjectId(id)
    const project = projects.find(p => p.id === id)
    setCategoryId(project?.categories[0]?.id ?? "")
  }

  const handleSave = async () => {
    if (!spaceId || !projectId || !categoryId || !name.trim()) return
    setSaving(true)

    const groupId = uuidv7()
    const category = categories.find(c => c.id === categoryId)

    addSavedGroup(spaceId, projectId, categoryId, {
      id: groupId,
      name: name.trim(),
      tabs: [],
      order: category?.groups.length ?? 0,
    })

    const filteredTabs = tabs.filter(t => t.url && !t.url.startsWith('chrome://'))
    const savedTabs = await Promise.all(
      filteredTabs.map(async (tab, i) => ({
        id: uuidv7(),
        url: tab.url || '',
        title: tab.title || 'Untitled',
        favicon: await faviconToDataUrl(tab.favIconUrl || ''),
        order: i,
      }))
    )
    addSavedTabsBatch(spaceId, projectId, categoryId, groupId, savedTabs)

    setSaving(false)
    onClose()
  }

  const canSave = spaceId && projectId && categoryId && name.trim()

  return (
    <Modal
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      title="Save Session"
      showClose={false}
      className="w-96 rounded-lg p-5 flex flex-col gap-4"
    >
        <h3 className="text-white/90 font-sans text-base font-medium">Save Session</h3>

        <div className="flex flex-col gap-1">
          <label className="text-white/50 text-xs font-sans">Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && canSave) handleSave() }}
            autoFocus
            className="bg-black-800 border border-black-700 rounded-md px-3 py-2 text-white/90 text-sm font-sans outline-none focus:border-white/30"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-white/50 text-xs font-sans">Save to</label>
          <div className="flex gap-2">
            <select value={spaceId} onChange={e => handleSpaceChange(e.target.value)} className="flex-1 bg-black-800 border border-black-700 rounded-md px-2 py-2 text-white/90 text-xs font-sans outline-none focus:border-white/30">
              {savedSpaces.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select value={projectId} onChange={e => handleProjectChange(e.target.value)} className="flex-1 bg-black-800 border border-black-700 rounded-md px-2 py-2 text-white/90 text-xs font-sans outline-none focus:border-white/30">
              {projects.length === 0 && <option value="">No projects</option>}
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className="flex-1 bg-black-800 border border-black-700 rounded-md px-2 py-2 text-white/90 text-xs font-sans outline-none focus:border-white/30">
              {categories.length === 0 && <option value="">No categories</option>}
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        <div className="text-white/40 text-xs font-sans">
          {tabs.filter(t => t.url && !t.url.startsWith('chrome://')).length} tabs will be saved
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-white/50 hover:text-white/70 text-sm font-sans rounded-md transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={!canSave || saving} className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white/90 text-sm font-sans rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
    </Modal>
  )
}

// --- Main Panel ---

export function RightPanel() {
  const { windows } = useWindows({ populate: true })
  const parentRef = useRef<HTMLDivElement>(null)
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  const [saveModal, setSaveModal] = useState<{ tabs: chrome.tabs.Tab[] } | null>(null)

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
      <div className="px-4 py-4 flex items-center gap-2 border-b border-black-800 shrink-0">
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
              <div className="sticky top-0 z-10 bg-black-900 border-b border-black-800 px-4 py-2 flex items-center gap-2">
                <button
                  onClick={() => toggleWindow(windowId)}
                  className="text-white/40 hover:text-white/60 transition-colors"
                >
                  <svg
                    className={`w-3.5 h-3.5 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                <span className="text-xs text-white/50 font-sans flex-1">
                  Window {index + 1}
                  <span className="text-white/25 ml-1.5">{tabs.length} tabs</span>
                </span>
                <button
                  onClick={() => handleSaveSession(tabs)}
                  className="text-white/25 hover:text-white/60 transition-colors"
                  title="Save this window as a group"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                </button>
              </div>

              {/* Tabs */}
              {!isCollapsed && (
                <div className="flex flex-col gap-1.5 p-3">
                  {tabs.map(tab => (
                    <OpenedTab key={tab.id} tab={tab} windowId={windowId} />
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
