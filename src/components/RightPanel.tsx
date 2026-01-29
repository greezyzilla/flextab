import { useDraggable } from "@dnd-kit/core"
import { DragHandleIcon } from "./icons/DragHandleIcon";
import { useWindows } from "~src/hooks/useWindows"
import { useVirtualizer } from '@tanstack/react-virtual'
import { useRef, useMemo } from 'react'

const OpenedTab = ({ tab, windowId }: { tab: chrome.tabs.Tab, windowId: number }) => {
  const onTabClick = (tab: chrome.tabs.Tab, windowId: number) => {
    chrome.tabs.update(tab.id, { active: true })
    chrome.windows.update(windowId, { focused: true })
  }

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: tab.id,
  })

  return (
    <div
      className="flex gap-3 items-center w-full rounded-md bg-black-800 hover:bg-black-700 px-3 py-2 text-left group"
      ref={setNodeRef}
      style={{
        transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
        opacity: isDragging ? 0.5 : 1,
      }}
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className={`${isDragging ? 'opacity-100' : 'opacity-40 group-hover:opacity-50 hover:!opacity-100'} cursor-grab active:cursor-grabbing p-1 rounded transition-opacity`}
        title="Drag to save"
      >
        <DragHandleIcon />
      </div>

      {/* Clickable content */}
      <div
        className="flex gap-3 items-center flex-1 cursor-pointer overflow-hidden"
        onClick={() => onTabClick(tab, windowId)}
      >
        <img src={tab.favIconUrl} alt={tab.title} className="w-5 h-5" />
        <div className="flex flex-col text-white/90 truncate">
          <div>{tab.title}</div>
          <div className="truncate">{tab.url}</div>
        </div>
      </div>
    </div>
  )
}

type VirtualItemData = 
  | { type: 'header'; windowId: number; index: number }
  | { type: 'tab'; tab: chrome.tabs.Tab; windowId: number };

export function RightPanel() {
  const { windows } = useWindows({
    populate: true,
  })
  const parentRef = useRef<HTMLDivElement>(null)

  // Flatten windows and tabs into a single list
  const rows = useMemo(() => {
    const items: VirtualItemData[] = [];
    windows.forEach((window, index) => {
      items.push({ type: 'header', windowId: window.id, index: index + 1 });
      window.tabs?.forEach(tab => {
        items.push({ type: 'tab', tab, windowId: window.id });
      });
    });
    return items;
  }, [windows]);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 60, // Approximate height average
    overscan: 5,
  })

  return (
    <div className="min-w-80 w-80 h-full flex flex-col">
      <div className="min-h-16 h-16 p-4 flex items-center gap-2 border-b border-black-800">
        <h2 className="text-white/90 font-sans text-lg">Opened Tabs</h2>
      </div>
      
      <div 
        ref={parentRef} 
        className="flex-1 overflow-y-auto p-4"
        style={{ contain: 'strict' }}
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const item = rows[virtualRow.index];
            return (
              <div
                key={virtualRow.key}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                  paddingBottom: '8px', // Spacing between items
                }}
              >
                {item.type === 'header' ? (
                  <div className="flex items-center gap-2 text-sm text-white/70 h-full">
                    Window {item.index}
                  </div>
                ) : (
                  <OpenedTab tab={item.tab} windowId={item.windowId} />
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="min-h-16 h-16 p-4 flex items-center gap-2 border-t border-black-800">
        {/* Footer actions could go here */}
      </div>
    </div>
  )
}
