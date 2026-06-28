import { useState, useRef, useEffect } from "react";
import { useDroppable } from "@dnd-kit/core";
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore";
import { useAuthStore } from "~src/store/useAuthStore";
import { v7 as uuidv7 } from "uuid";
import { showUndoToast } from "~src/components/ui/sonner";
import { GlobalSettingsModal } from "~src/components/GlobalSettingsModal";
import { ConfirmDialog } from "~src/components/ui/confirm-dialog";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "~src/components/ui/dropdown-menu";
import { Tooltip, TooltipTrigger, TooltipContent } from "~src/components/ui/tooltip";
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem } from "~src/components/ui/context-menu";
import { Input } from "~src/components/ui/input";
import { SyncStatusIndicator } from "~src/components/SyncStatusIndicator";

export function ProfilePanel() {
  const { savedSpaces, activeSpaceId, setActiveSpace, addSavedSpace, updateSavedSpace, removeSavedSpace, reorderSpaces } = useSavedSpacesStore();
  const { user, isAuthenticated, loginWithGoogle, logout } = useAuthStore();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [showGlobalSettings, setShowGlobalSettings] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renaming]);

  const handleAddSpace = () => {
    const id = uuidv7();
    addSavedSpace({
      id,
      name: `Space ${savedSpaces.length + 1}`,
      projects: [],
    });
    setActiveSpace(id);
  };


  const handleRenameStart = (spaceId: string) => {
    const space = savedSpaces.find(s => s.id === spaceId);
    if (!space) return;
    setRenameValue(space.name);
    setRenaming(spaceId);
  };

  const handleRenameSubmit = () => {
    if (!renaming) return;
    const space = savedSpaces.find(s => s.id === renaming);
    if (space && renameValue.trim()) {
      updateSavedSpace({ ...space, name: renameValue.trim() });
    }
    setRenaming(null);
  };

  const [confirmDeleteSpace, setConfirmDeleteSpace] = useState<(typeof savedSpaces)[number] | null>(null);

  const handleDeleteSpace = (spaceId: string) => {
    const space = savedSpaces.find(s => s.id === spaceId);
    if (!space) return;
    if (savedSpaces.length <= 1) return; // Don't delete the last space
    setConfirmDeleteSpace(space);
  };

  return (
    <div className="w-16 h-full flex flex-col border-r border-black-800">
      <ConfirmDialog
        open={!!confirmDeleteSpace}
        onOpenChange={(o) => { if (!o) setConfirmDeleteSpace(null); }}
        title="Delete space?"
        message={
          <>
            This permanently removes <span className="text-white/80">{confirmDeleteSpace?.name}</span> and all its projects, groups, and tabs.
          </>
        }
        confirmLabel="Delete space"
        onConfirm={() => {
          const space = confirmDeleteSpace;
          if (!space) return;
          removeSavedSpace(space);
          showUndoToast(`Deleted space "${space.name}"`, () => addSavedSpace(space));
        }}
      />
      <div className="flex flex-col gap-3 py-4 items-center flex-1">
        {savedSpaces.map((space) => (
          <DroppableSpace key={space.id} spaceId={space.id}>
            <div className="relative">
              {renaming === space.id ? (
                <div className="absolute left-14 top-0 z-50 bg-black-800 border border-black-700 rounded-lg shadow-xl p-2 w-40">
                  <Input
                    variant="inline"
                    ref={renameInputRef}
                    type="text"
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onBlur={handleRenameSubmit}
                    onKeyDown={e => {
                      if (e.key === "Enter") handleRenameSubmit();
                      if (e.key === "Escape") setRenaming(null);
                    }}
                    className="w-full text-xs"
                  />
                </div>
              ) : null}
              <ContextMenu>
              <ContextMenuTrigger asChild>
              <div
                onClick={() => setActiveSpace(space.id)}
                className={`w-10 h-10 rounded-full cursor-pointer transition-all flex items-center justify-center text-xs font-medium font-sans ${
                  activeSpaceId === space.id ? "ring-2 ring-white/50 text-white/90" : "hover:brightness-125 text-white/70"
                }`}
                style={{
                  backgroundColor: space.color
                    ? `${space.color}${activeSpaceId === space.id ? '40' : '25'}`
                    : activeSpaceId === space.id ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)',
                  ...(space.color && activeSpaceId === space.id ? { borderColor: space.color, ringColor: space.color } : {}),
                }}
                title={space.name}
              >
                {(space.abbreviation || space.name.slice(0, 2)).toUpperCase()}
              </div>
              </ContextMenuTrigger>
              <ContextMenuContent side="right">
                <ContextMenuItem onSelect={() => handleRenameStart(space.id)}>Rename</ContextMenuItem>
                {(() => {
                  const sorted = [...savedSpaces].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
                  const idx = sorted.findIndex(s => s.id === space.id);
                  return (
                    <>
                      {idx > 0 && <ContextMenuItem onSelect={() => reorderSpaces(idx, idx - 1)}>Move up</ContextMenuItem>}
                      {idx < sorted.length - 1 && <ContextMenuItem onSelect={() => reorderSpaces(idx, idx + 1)}>Move down</ContextMenuItem>}
                    </>
                  );
                })()}
                {savedSpaces.length > 1 && (
                  <ContextMenuItem className="text-red-400 focus:bg-red-400/10 focus:text-red-400" onSelect={() => handleDeleteSpace(space.id)}>Delete</ContextMenuItem>
                )}
              </ContextMenuContent>
              </ContextMenu>
            </div>
          </DroppableSpace>
        ))}
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              onClick={handleAddSpace}
              className="w-10 h-10 rounded-full border border-white/30 border-dashed text-white/50 flex items-center justify-center cursor-pointer hover:border-white/50 hover:text-white/70 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </div>
          </TooltipTrigger>
          <TooltipContent side="right">Add space</TooltipContent>
        </Tooltip>
      </div>
      <div className="flex flex-col gap-2 py-4 items-center">
        <SyncStatusIndicator />
        <Tooltip>
        <TooltipTrigger asChild>
        <div
          onClick={() => setShowGlobalSettings(true)}
          className="w-10 h-10 rounded-full bg-black-800 hover:bg-black-700 cursor-pointer flex items-center justify-center transition-colors"
        >
          <svg className="w-5 h-5 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          </svg>
        </div>
        </TooltipTrigger>
        <TooltipContent side="right">Settings</TooltipContent>
        </Tooltip>
        {isAuthenticated && user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-10 h-10 rounded-full cursor-pointer overflow-hidden outline-none" aria-label={user.name}>
                {user.avatar ? (
                  <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-full h-full bg-[var(--accent)] flex items-center justify-center text-white text-sm font-medium">
                    {user.name.slice(0, 1).toUpperCase()}
                  </div>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start">
              <DropdownMenuLabel>
                <div className="text-white/80 text-xs font-medium truncate max-w-[10rem]">{user.name}</div>
                <div className="text-white/40 text-[11px] truncate max-w-[10rem]">{user.email}</div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => logout()}>Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div
            onClick={loginWithGoogle}
            className="w-10 h-10 rounded-full bg-black-800 hover:bg-black-700 cursor-pointer flex items-center justify-center transition-colors"
            title="Sign in"
          >
            <svg className="w-5 h-5 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
            </svg>
          </div>
        )}
      </div>

      <GlobalSettingsModal open={showGlobalSettings} onOpenChange={setShowGlobalSettings} />
    </div>
  )
}

function DroppableSpace({ spaceId, children }: { spaceId: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `space-drop:${spaceId}`,
  });

  return (
    <div ref={setNodeRef} className={`rounded-full transition-all ${isOver ? 'ring-2 ring-white/40 scale-110' : ''}`}>
      {children}
    </div>
  );
}
