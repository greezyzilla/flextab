import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore";
import { useRoute, navigate } from "~src/lib/route";
import { showUndoToast } from "~src/components/ui/sonner";
import { Button, IconButton, buttonVariants } from "~src/components/ui/button";
import { Input } from "~src/components/ui/input";
import { Label } from "~src/components/ui/label";
import { SpaceAvatar } from "~src/components/levelIcons";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "~src/components/ui/alert-dialog";
import { cn } from "~src/lib/utils";
import type { SavedSpace } from "~src/types";
import { GroupHeading } from "./shared";
import { SETTINGS_ROUTE } from "./types";

export const SPACE_COLORS = [
  "", "#2274F0", "#8b5cf6", "#ec4899", "#ef4444",
  "#f97316", "#eab308", "#22c55e", "#06b6d4",
];
export const SPACE_COLOR_NAMES: Record<string, string> = {
  "": "Default", "#2274F0": "Blue", "#8b5cf6": "Violet", "#ec4899": "Pink", "#ef4444": "Red",
  "#f97316": "Orange", "#eab308": "Yellow", "#22c55e": "Green", "#06b6d4": "Cyan",
};

export const SPACES_ROUTE = `${SETTINGS_ROUTE}/spaces`;

/** The space a `#/settings/spaces/<id>` route points at, if any. */
export function spaceIdFromRoute(route: string): string | null {
  const m = route.match(/^\/settings\/spaces\/([^/]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function countOf(space: SavedSpace) {
  const projects = space.projects.length;
  const tabs = space.projects.reduce((n, p) => n + p.categories.reduce((m, c) => m + c.groups.reduce((k, g) => k + (g.tabs?.length ?? 0), 0), 0), 0);
  return { projects, tabs };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Settings › Spaces: the one home for managing spaces (order, name, look,
 * deletion). A space is the top level of everything the user saved, so these
 * are deliberate settings, not quick actions on the rail or the sidebar.
 */
export function SpacesTab() {
  const { savedSpaces, activeSpaceId, reorderSpaces } = useSavedSpacesStore();
  // Array order: the order the rail shows, and the index reorderSpaces moves.
  const sorted = savedSpaces;
  const routeId = spaceIdFromRoute(useRoute());
  const selected = sorted.find(s => s.id === routeId) ?? sorted.find(s => s.id === activeSpaceId) ?? sorted[0];

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <GroupHeading>Your spaces</GroupHeading>
        <ul className="flex flex-col gap-1" aria-label="Spaces">
          {sorted.map((space, i) => {
            const { projects, tabs } = countOf(space);
            const isSelected = space.id === selected?.id;
            return (
              <li key={space.id}
                className={`flex items-center gap-1 rounded-lg pr-1 transition-colors ${isSelected ? "bg-ink/[0.06]" : "hover:bg-ink/[0.03]"}`}>
                <button
                  type="button"
                  aria-current={isSelected ? "true" : undefined}
                  onClick={() => navigate(`${SPACES_ROUTE}/${encodeURIComponent(space.id)}`)}
                  className="flex flex-1 min-w-0 items-center gap-3 rounded-lg px-3 py-2.5 text-left outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <SpaceAvatar space={space} size={28} active={isSelected} />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-sans text-fg">{space.name}</span>
                    <span className="text-xs font-sans text-fg-subtle">{plural(projects, "project")} · {plural(tabs, "tab")}</span>
                  </span>
                </button>
                <IconButton aria-label={`Move ${space.name} up`} disabled={i === 0}
                  onClick={() => reorderSpaces(i, i - 1)} className="disabled:opacity-25 disabled:pointer-events-none">
                  <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                </IconButton>
                <IconButton aria-label={`Move ${space.name} down`} disabled={i === sorted.length - 1}
                  onClick={() => reorderSpaces(i, i + 1)} className="disabled:opacity-25 disabled:pointer-events-none">
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                </IconButton>
              </li>
            );
          })}
        </ul>
      </section>

      {selected && <SpaceDetail key={selected.id} space={selected} isLast={sorted.length <= 1} />}
    </div>
  );
}

function SpaceDetail({ space, isLast }: { space: SavedSpace; isLast: boolean }) {
  const { updateSavedSpace } = useSavedSpacesStore();
  const [name, setName] = useState(space.name);
  const [abbreviation, setAbbreviation] = useState(space.abbreviation ?? "");
  const [color, setColor] = useState(space.color ?? "");
  // Follow edits made elsewhere (another device, the rail) while unchanged here.
  useEffect(() => { setName(space.name); setAbbreviation(space.abbreviation ?? ""); setColor(space.color ?? ""); },
    [space.name, space.abbreviation, space.color]);

  const dirty = name.trim() !== space.name || abbreviation.trim() !== (space.abbreviation ?? "") || color !== (space.color ?? "");
  const save = () => {
    if (!dirty) return;
    updateSavedSpace({ ...space, name: name.trim() || space.name, abbreviation: abbreviation.trim() || undefined, color: color || undefined });
  };

  return (
    <>
      <section className="flex flex-col gap-5" aria-label={`${space.name} settings`}>
        <GroupHeading>{space.name}</GroupHeading>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="space-name">Name</Label>
          <Input id="space-name" placeholder="e.g. Work" value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") save(); }} className="w-full" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="space-abbreviation">Abbreviation (max 2)</Label>
          <Input id="space-abbreviation" value={abbreviation} onChange={e => setAbbreviation(e.target.value.slice(0, 2))}
            placeholder={space.name.slice(0, 2).toUpperCase()}
            onKeyDown={e => { if (e.key === "Enter") save(); }} className="w-20" />
        </div>
        <div className="flex flex-col gap-2">
          <Label id="space-color-label">Color</Label>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby="space-color-label">
            {SPACE_COLORS.map(c => (
              <button key={c || "default"} type="button" onClick={() => setColor(c)}
                aria-label={`${SPACE_COLOR_NAMES[c] ?? c} color`} aria-pressed={color === c}
                className={`h-6 w-6 rounded-full border-2 outline-none transition-all focus-visible:ring-1 focus-visible:ring-ring ${color === c ? "border-ink/70 scale-110" : "border-transparent hover:border-ink/30"}`}
                style={{ backgroundColor: c || "hsl(var(--ink) / 0.15)" }} />
            ))}
          </div>
        </div>
        <div>
          <Button size="sm" onClick={save} disabled={!dirty}>Save changes</Button>
        </div>
      </section>

      <DangerZone space={space} isLast={isLast} />
    </>
  );
}

/**
 * Deleting a space removes everything saved in it, on every synced device, so
 * it lives only here and asks for the space's name before it goes. Undo stays.
 */
function DangerZone({ space, isLast }: { space: SavedSpace; isLast: boolean }) {
  const { removeSavedSpace, addSavedSpace } = useSavedSpacesStore();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const { projects, tabs } = countOf(space);
  const matches = typed.trim() === space.name.trim();

  const remove = () => {
    removeSavedSpace(space);
    showUndoToast(`Deleted space "${space.name}"`, () => addSavedSpace(space));
    navigate(SPACES_ROUTE);
  };

  return (
    <section className="flex flex-col gap-3 border-t border-ink/10 pt-6" aria-labelledby="danger-zone-heading">
      <h3 id="danger-zone-heading" className="text-fg-subtle text-[11px] font-medium font-sans uppercase tracking-wider">Danger zone</h3>
      <div className="flex items-start justify-between gap-4 rounded-lg border border-red-400/25 p-4">
        <div className="min-w-0">
          <div className="text-sm font-sans font-medium text-fg">Delete this space</div>
          <p className="mt-0.5 text-xs font-sans leading-relaxed text-fg-subtle">
            {isLast
              ? "This is your only space. Create another space before deleting this one."
              : `Removes ${plural(projects, "project")} and ${plural(tabs, "tab")} on every synced device.`}
          </p>
        </div>
        <Button variant="destructive" size="sm" disabled={isLast} onClick={() => { setTyped(""); setOpen(true); }}>
          Delete space…
        </Button>
      </div>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{space.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes {plural(projects, "project")} and {plural(tabs, "tab")} in this space, on every synced device.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirm-space-name">Type <span className="text-fg">{space.name}</span> to confirm</Label>
            <Input id="confirm-space-name" placeholder="Type it exactly as shown" value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off" className="w-full"
              onKeyDown={e => { if (e.key === "Enter" && matches) { setOpen(false); remove(); } }} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" size="sm" disabled={!matches} onClick={remove}>
              Delete space
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
