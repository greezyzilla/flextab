import { SignOutDialog } from "~src/components/SignOutDialog";
import { commitOnBlur } from "~src/lib/inlineEdit";
import { useState, useRef, useEffect } from "react";
import { useDroppable } from "@dnd-kit/core";
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore";
import { useAuthStore } from "~src/store/useAuthStore";
import { v7 as uuidv7 } from "uuid";
import { navigate, useRoute } from "~src/lib/route";
import { SETTINGS_ROUTE, isSettingsRoute } from "~src/components/SettingsPage";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "~src/components/ui/dropdown-menu";
import { Tooltip, TooltipTrigger, TooltipContent } from "~src/components/ui/tooltip";
import { Input } from "~src/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "~src/components/ui/avatar";
import { spaceAvatarColors } from "~src/components/levelIcons";
import { SIGN_IN_ROUTE } from "~src/lib/workspaceAccess";
import { parseContainerDrag } from "~src/services/dragDrop";
import { SPRING_LOAD_MS } from "~src/hooks/useDragAndDrop";

export function ProfilePanel() {
  const { savedSpaces, activeSpaceId, setActiveSpace, addSavedSpace } = useSavedSpacesStore();
  const { user, isAuthenticated } = useAuthStore();
  const manifestIcon = typeof chrome !== "undefined" && chrome.runtime?.getManifest
    ? chrome.runtime.getManifest().icons?.["128"]
    : undefined;
  const logoSrc = manifestIcon && chrome.runtime?.getURL
    ? chrome.runtime.getURL(manifestIcon)
    : undefined;
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

  const finishCreateSpace = (commit: boolean) => {
    if (newSpaceDone.current) return;
    newSpaceDone.current = true;
    setCreatingSpace(false);
    const name = newSpaceName.trim();
    if (!commit || !name) return;
    const id = uuidv7();
    addSavedSpace({ id, name, projects: [], order: savedSpaces.length });
    setActiveSpace(id);
    navigate("/");
  };


  return (
    <nav aria-label="Spaces" className="w-16 h-full flex flex-col border-r border-line">
      <SignOutDialog open={signOutOpen} onOpenChange={setSignOutOpen} />
      <div className="flex flex-col items-center flex-1">
        {/* Header — h-16 to line up with the brand header in LeftPanel / the
            search-bar row in the middle column / "Opened Tabs" in RightPanel. */}
        <div className="h-16 w-full flex items-center justify-center border-b border-line shrink-0">
          <div
            className="w-10 h-10 rounded-2xl border flex items-center justify-center"
            style={{
              backgroundColor: "var(--accent-subtle)",
              borderColor: "color-mix(in srgb, var(--accent) 34%, transparent)",
              boxShadow: "0 10px 24px -18px var(--accent), inset 0 1px 0 rgba(255,255,255,0.08)",
            }}
          >
            {logoSrc ? (
              <span
                aria-label="FlexTab"
                role="img"
                className="h-7 w-7"
                style={{
                  background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 70%, #ffffff), var(--accent))",
                  WebkitMask: `url(${logoSrc}) center / contain no-repeat`,
                  mask: `url(${logoSrc}) center / contain no-repeat`,
                }}
              />
            ) : (
              <span className="text-sm font-semibold" style={{ color: "var(--accent)" }}>F</span>
            )}
          </div>
        </div>
        {/* pt-2 centers the first 40px avatar within the same 56px band as the
            "Personal" row in LeftPanel / category row in ContentPanel / window
            row in RightPanel, so the space rail lines up with them too. */}
        <div className="flex flex-col gap-3 items-center pt-2 pb-4 flex-1">
        {savedSpaces.map((space) => (
          <DroppableSpace key={space.id} spaceId={space.id}>
            <div className="relative">
              {/* Switching only. Managing spaces (order, rename, delete)
                  lives in Settings › Spaces. */}
              <button
                type="button"
                aria-label={`Switch to ${space.name}`}
                aria-pressed={!inSettings && activeSpaceId === space.id}
                onClick={() => { setActiveSpace(space.id); navigate("/"); }}
                className={`w-10 h-10 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-black-900 cursor-pointer transition-all flex items-center justify-center text-xs font-normal font-sans ${
                  !inSettings && activeSpaceId === space.id ? "ring-2 ring-ink/50" : "hover:brightness-125"
                }`}
                style={{
                  ...spaceAvatarColors(space, !inSettings && activeSpaceId === space.id),
                  ...(space.color && !inSettings && activeSpaceId === space.id ? { borderColor: space.color, ringColor: space.color } : {}),
                }}
                title={space.name}
              >
                {(space.abbreviation || space.name.slice(0, 2)).toUpperCase()}
              </button>
            </div>
          </DroppableSpace>
        ))}
        {creatingSpace && (
          <div className="relative">
            <div aria-hidden className="w-10 h-10 rounded-full border border-dashed border-ink/50 flex items-center justify-center text-xs font-medium text-fg-muted">
              {(newSpaceName.trim().slice(0, 2) || "··").toUpperCase()}
            </div>
            <div className="absolute left-14 top-0 z-50 bg-black-800 border border-black-700 rounded-lg shadow-xl p-2 w-48 flex flex-col gap-1">
              {/* A small floating form, not a row: the form field with its neutral
                  focus (TASK-62). The hint stays; here it costs no layout. */}
              <Input
                autoFocus
                aria-label="New space name"
                placeholder="Space name"
                value={newSpaceName}
                onChange={e => setNewSpaceName(e.target.value)}
                onBlur={commitOnBlur(() => finishCreateSpace(true))}
                onKeyDown={e => {
                  if (e.key === "Enter") { e.preventDefault(); finishCreateSpace(true); }
                  if (e.key === "Escape") { e.preventDefault(); finishCreateSpace(false); }
                }}
                className="w-full text-xs"
              />
              <span className="text-[11px] text-fg-subtle font-sans">Enter to create · Esc to cancel</span>
            </div>
          </div>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Add space"
              onClick={handleAddSpace}
              className="w-10 h-10 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring border border-ink/30 border-dashed text-fg-subtle flex items-center justify-center cursor-pointer hover:border-ink/50 hover:text-fg-muted transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Add space</TooltipContent>
        </Tooltip>
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
          <svg className={`w-5 h-5 ${inSettings ? "text-fg" : "text-fg-subtle"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          </svg>
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
          <button
            type="button"
            aria-label="Sign in"
            onClick={() => navigate(SIGN_IN_ROUTE)}
            className="w-10 h-10 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring bg-black-800 hover:bg-black-700 cursor-pointer flex items-center justify-center transition-colors"
            title="Sign in"
          >
            <svg className="w-5 h-5 text-fg-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
            </svg>
          </button>
        )}
      </div>
    </nav>
  )
}

function DroppableSpace({ spaceId, children }: { spaceId: string; children: React.ReactNode }) {
  const { setNodeRef, isOver, active } = useDroppable({
    id: `space-drop:${spaceId}`,
  });
  const activeSpaceId = useSavedSpacesStore((s) => s.activeSpaceId);
  // A dragged category cannot land on a space: hovering one opens it after a
  // moment (spring-loaded, TASK-59). That reads as a countdown ring, not as the
  // drop highlight (ring + grow), so the avatar never promises a drop.
  const opens = isOver && !!active && parseContainerDrag(active.id)?.kind === "category";

  return (
    <div ref={setNodeRef} className={`relative rounded-full transition-all ${isOver && !opens ? 'ring-2 ring-ink/40 scale-110' : ''}`}>
      {children}
      {opens && spaceId !== activeSpaceId && <SpringLoadRing />}
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
