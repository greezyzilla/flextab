import { BrandMark } from "~src/components/ui/brand-mark";
import { SignOutDialog } from "~src/components/SignOutDialog";
import { Icon } from "~src/components/ui/icon"
import { Plus, Settings, User } from "lucide-react"
import { commitOnBlur } from "~src/lib/inlineEdit";
import { useState, useRef, useEffect } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore";
import { useAuthStore } from "~src/store/useAuthStore";
import { navigate, useRoute } from "~src/lib/route";
import { SETTINGS_ROUTE, isSettingsRoute } from "~src/components/SettingsPage";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "~src/components/ui/dropdown-menu";
import { Tooltip, TooltipTrigger, TooltipContent } from "~src/components/ui/tooltip";
import { ShortcutTooltip } from "~src/components/ui/kbd";
import { useUIStore } from "~src/store/useUIStore";
import { createSpace } from "~src/lib/defaultPath";
import { Input, INLINE_CREATE_HINT } from "~src/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "~src/components/ui/avatar";
import { spaceAvatarColors } from "~src/components/levelIcons";
import { SIGN_IN_ROUTE } from "~src/lib/workspaceAccess";
import { parseContainerDrag, spaceDragId } from "~src/services/dragDrop";
import { SPRING_LOAD_MS } from "~src/hooks/useDragAndDrop";

export function ProfilePanel() {
  const { savedSpaces, activeSpaceId, setActiveSpace } = useSavedSpacesStore();
  const { user, isAuthenticated } = useAuthStore();
  const [signOutOpen, setSignOutOpen] = useState(false);
  const inSettings = isSettingsRoute(useRoute());

  // Name-first, like projects/categories: nothing is created until the user
  // commits a name. No chained project prompt: saving into the new space
  // works right away (default project/category + Unsorted, TASK-20).
  const [creatingSpace, setCreatingSpace] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState("");
  const newSpaceDone = useRef(false);

  const handleAddSpace = () => {
    newSpaceDone.current = false;
    setNewSpaceName("");
    setCreatingSpace(true);
  };

  // Alt+N (TASK-81) opens this same field. With no spaces on the workspace
  // page, the empty state's "New space" entry answers instead.
  const spaceNamingRequest = useUIStore((s) => s.spaceNamingRequest);
  useEffect(() => {
    if (spaceNamingRequest === 0) return;
    if (savedSpaces.length === 0 && !inSettings) return;
    handleAddSpace();
  }, [spaceNamingRequest]);

  const finishCreateSpace = (commit: boolean) => {
    if (newSpaceDone.current) return;
    newSpaceDone.current = true;
    setCreatingSpace(false);
    const name = newSpaceName.trim();
    if (!commit || !name) return;
    // Starts with General › Uncategorized, so it opens on a category (TASK-98).
    setActiveSpace(createSpace(name));
    navigate("/");
  };


  return (
    <nav aria-label="Spaces" className="w-16 h-full flex flex-col border-r border-line">
      <SignOutDialog open={signOutOpen} onOpenChange={setSignOutOpen} />
      <div className="flex flex-col items-center flex-1">
        {/* Header — h-16 to line up with the brand header in LeftPanel / the
            search-bar row in the middle column / "Opened Tabs" in RightPanel. */}
        <div className="h-16 w-full flex items-center justify-center border-b border-line shrink-0">
          <BrandMark label="FlexTab" />
        </div>
        {/* pt-2 centers the first 40px avatar within the same 56px band as the
            "Personal" row in LeftPanel / category row in ContentPanel / window
            row in RightPanel, so the space rail lines up with them too. */}
        <div className="flex flex-col gap-3 items-center pt-2 pb-4 flex-1">
        {/* The other avatars move aside while one is dragged, as tabs and groups
            do (TASK-66), so the rail shows its new order before the drop. */}
        <SortableContext items={savedSpaces.map((s) => spaceDragId(s.id))} strategy={verticalListSortingStrategy}>
        {savedSpaces.map((space) => (
          <DroppableSpace key={space.id} spaceId={space.id}>
            <DraggableSpace spaceId={space.id}>
              {/* A click switches; dragging it puts it elsewhere in the rail
                  (TASK-66). Rename and delete live in Settings › Spaces,
                  which also keeps Move up/down for the keyboard. */}
              {(drag) => (
              <Tooltip>
              <TooltipTrigger asChild>
              <button
                ref={drag.ref}
                onPointerDown={drag.onPointerDown}
                type="button"
                aria-label={`Switch to ${space.name}`}
                aria-pressed={!inSettings && activeSpaceId === space.id}
                onClick={() => { if (drag.dragged()) return; setActiveSpace(space.id); navigate("/"); }}
                className={`w-10 h-10 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-black-900 cursor-pointer transition-all flex items-center justify-center text-xs font-normal font-sans ${
                  !inSettings && activeSpaceId === space.id ? "ring-2 ring-ink/50" : "hover:brightness-125"
                }`}
                style={{
                  ...spaceAvatarColors(space, !inSettings && activeSpaceId === space.id),
                  ...(space.color && !inSettings && activeSpaceId === space.id ? { borderColor: space.color, ringColor: space.color } : {}),
                }}
              >
                {(space.abbreviation || space.name.slice(0, 2)).toUpperCase()}
              </button>
              </TooltipTrigger>
              <TooltipContent side="right">{space.name}</TooltipContent>
              </Tooltip>
              )}
            </DraggableSpace>
          </DroppableSpace>
        ))}
        </SortableContext>
        {creatingSpace && (
          <div className="relative">
            {/* The space to be, drawn like the Add space button: a dashed circle
                that takes the name's first letters as they are typed. */}
            <div aria-hidden className="w-10 h-10 rounded-full border border-dashed border-ink/50 flex items-center justify-center text-xs font-medium text-fg-muted">
              {newSpaceName.trim().slice(0, 2).toUpperCase()}
            </div>
            {/* The app's popover surface (same tokens as menus) around the form
                field; Enter/Esc is read to screen readers, not printed (TASK-62). */}
            <div className="absolute left-14 top-0 z-50 w-48 rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
              <Input
                autoFocus
                aria-label="New space name"
                aria-description={INLINE_CREATE_HINT}
                placeholder="Space name"
                value={newSpaceName}
                onChange={e => setNewSpaceName(e.target.value)}
                onBlur={commitOnBlur(() => finishCreateSpace(true))}
                onKeyDown={e => {
                  if (e.key === "Enter") { e.preventDefault(); finishCreateSpace(true); }
                  if (e.key === "Escape") { e.preventDefault(); finishCreateSpace(false); }
                }}
              />
            </div>
          </div>
        )}
        <ShortcutTooltip label="Add space" shortcut="Alt+N" side="right">
          <button
            type="button"
            aria-label="Add space"
            onClick={handleAddSpace}
            className="w-10 h-10 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring border border-ink/30 border-dashed text-fg-subtle flex items-center justify-center cursor-pointer hover:border-ink/50 hover:text-fg-muted transition-colors"
          >
            <Icon icon={Plus} size="xl" />
          </button>
        </ShortcutTooltip>
        </div>
      </div>
      <div className="flex flex-col gap-2 py-4 items-center">
        <Tooltip>
        <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="Settings"
          aria-pressed={inSettings}
          onClick={() => navigate(SETTINGS_ROUTE)}
          className={`w-10 h-10 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-black-900 cursor-pointer flex items-center justify-center transition-colors ${
            inSettings ? "bg-black-700 ring-2 ring-ink/50" : "bg-black-800 hover:bg-black-700"
          }`}
        >
          <Icon icon={Settings} size="lg" className={inSettings ? "text-fg" : "text-fg-subtle"} />
        </button>
        </TooltipTrigger>
        <TooltipContent side="right">Settings</TooltipContent>
        </Tooltip>
        {isAuthenticated && user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="cursor-pointer rounded-full outline-none focus-visible:ring-1 focus-visible:ring-ring" aria-label={user.name}>
                <Avatar className="h-10 w-10">
                  {user.avatar ? (
                    <AvatarImage src={user.avatar} alt={user.name} referrerPolicy="no-referrer" />
                  ) : null}
                  <AvatarFallback>
                    {(user.name || "?").slice(0, 1).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start">
              <DropdownMenuLabel>
                <div className="text-fg text-xs font-medium truncate max-w-[10rem]">{user.name}</div>
                <div className="text-fg-subtle text-[11px] truncate max-w-[10rem]">{user.email}</div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setSignOutOpen(true)}>Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Tooltip>
          <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Sign in"
            onClick={() => navigate(SIGN_IN_ROUTE)}
            className="w-10 h-10 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring bg-black-800 hover:bg-black-700 cursor-pointer flex items-center justify-center transition-colors"
          >
            <Icon icon={User} size="lg" className="text-fg-subtle" />
          </button>
          </TooltipTrigger>
          <TooltipContent side="right">Sign in</TooltipContent>
          </Tooltip>
        )}
      </div>
    </nav>
  )
}

function DroppableSpace({ spaceId, children }: { spaceId: string; children: React.ReactNode }) {
  const zone = `space-drop:${spaceId}`;
  const { setNodeRef, isOver, active } = useDroppable({ id: zone });
  const activeSpaceId = useSavedSpacesStore((s) => s.activeSpaceId);
  // A dragged category cannot land on a space: hovering one opens it after a
  // moment (spring-loaded, TASK-59). That reads as a countdown ring, not as the
  // drop highlight (ring + grow), so the avatar never promises a drop.
  const opens = isOver && !!active && parseContainerDrag(active.id)?.kind === "category";
  // A dragged space goes between spaces, never into one (TASK-66): no
  // "inside" highlight; the other avatars move aside instead.
  const movingSpace = !!active && parseContainerDrag(active.id)?.kind === "space";

  return (
    <div ref={setNodeRef} className={`relative rounded-full transition-all ${isOver && !opens && !movingSpace ? 'ring-2 ring-ink/40 scale-110' : ''}`}>
      {children}
      {opens && spaceId !== activeSpaceId && <SpringLoadRing />}
    </div>
  );
}

/** How far the pointer must move on an avatar before it becomes a drag; less is a click. */
const SPACE_DRAG_PX = 4;

/**
 * A rail avatar that can be dragged to a new place (TASK-66). The drag only
 * starts once the pointer has moved a little, so a click still switches space
 * without the avatar lifting. While one is dragged the others move aside, and
 * the dragged one's own slot shows dimmed where it will land. The keyboard
 * keeps the button's own Enter/Space (switch); Settings › Spaces has Move up/down.
 */
function DraggableSpace({ spaceId, children }: {
  spaceId: string;
  children: (drag: { ref: (el: HTMLElement | null) => void; onPointerDown: (e: React.PointerEvent) => void; dragged: () => boolean }) => React.ReactNode;
}) {
  const { setNodeRef, listeners, isDragging, transform, transition } = useSortable({ id: spaceDragId(spaceId) });
  const didDrag = useRef(false);
  const onPointerDown = (down: React.PointerEvent) => {
    if (down.button !== 0) return;
    didDrag.current = false;
    const start = { x: down.clientX, y: down.clientY };
    const native = down.nativeEvent;
    const target = down.currentTarget;
    const move = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < SPACE_DRAG_PX) return;
      stop();
      didDrag.current = true;
      // Hand the press to dnd-kit as it began, so the drag starts where the pointer went down.
      listeners?.onPointerDown?.({ nativeEvent: native, currentTarget: target, target } as unknown as React.PointerEvent);
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };
  return (
    <div className="relative" style={{ transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.5 : undefined }}>
      {children({ ref: setNodeRef, onPointerDown, dragged: () => { const d = didDrag.current; didDrag.current = false; return d; } })}
    </div>
  );
}

const RING_RADIUS = 22;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;
const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Fills once around the avatar over the spring-load delay; with reduced motion it shows full at once. */
function SpringLoadRing() {
  const ring = useRef<SVGCircleElement>(null);
  const [still] = useState(reducedMotion);
  useEffect(() => {
    if (still || !ring.current?.animate) return;
    const fill = ring.current.animate(
      [{ strokeDashoffset: RING_LENGTH }, { strokeDashoffset: 0 }],
      { duration: SPRING_LOAD_MS, easing: "linear", fill: "forwards" },
    );
    return () => fill.cancel();
  }, [still]);
  return (
    <svg aria-hidden data-spring-load className="pointer-events-none absolute -inset-1 h-12 w-12 -rotate-90" viewBox="0 0 48 48">
      <circle cx="24" cy="24" r={RING_RADIUS} fill="none" stroke="var(--color-line)" strokeWidth="2" />
      <circle ref={ring} cx="24" cy="24" r={RING_RADIUS} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round"
        strokeDasharray={RING_LENGTH} strokeDashoffset={still ? 0 : RING_LENGTH} />
    </svg>
  );
}
