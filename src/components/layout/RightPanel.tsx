import { useState, useRef, useCallback } from "react"
import { useDraggable } from "@dnd-kit/core"
import { DragHandleIcon } from "../icons/DragHandleIcon"
import { FaviconImg } from "../FaviconImg"
import { useWindows } from "~src/hooks/useWindows"
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore"
import { v7 as uuidv7 } from "uuid"
import { faviconToDataUrl } from "~src/utils/favicon"
import { Dialog, DialogContent, DialogTitle } from "~src/components/ui/dialog"
import { Button, IconButton } from "~src/components/ui/button"
import { Tooltip, TooltipTrigger, TooltipContent } from "~src/components/ui/tooltip"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "~src/components/ui/select"
import { Input } from "~src/components/ui/input"
import { Label } from "~src/components/ui/label"

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
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="w-96 p-5 flex flex-col gap-4">
        <DialogTitle className="text-white/90 font-sans text-base font-medium">Save Session</DialogTitle>

        <div className="flex flex-col gap-1">
          <Label>Name</Label>
          <Input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && canSave) handleSave() }}
            autoFocus
            className="w-full"
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label>Save to</Label>
          <div className="flex gap-2">
            <Select value={spaceId} onValueChange={handleSpaceChange}>
              <SelectTrigger className="flex-1"><SelectValue placeholder="Space" /></SelectTrigger>
              <SelectContent>
                {savedSpaces.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={projectId} onValueChange={handleProjectChange}>
              <SelectTrigger className="flex-1" disabled={projects.length === 0}><SelectValue placeholder="No projects" /></SelectTrigger>
              <SelectContent>
                {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="flex-1" disabled={categories.length === 0}><SelectValue placeholder="No categories" /></SelectTrigger>
              <SelectContent>
                {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="text-white/40 text-xs font-sans">
          {tabs.filter(t => t.url && !t.url.startsWith('chrome://')).length} tabs will be saved
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="default" onClick={handleSave} disabled={!canSave || saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
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
