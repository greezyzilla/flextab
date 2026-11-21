import { useEffect, useState } from "react";
import { Icon } from "~src/components/ui/icon"
import { ChevronDown, ChevronUp, ShieldAlert, SlidersHorizontal } from "lucide-react";
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore";
import { useRoute, navigate } from "~src/lib/route";
import { showUndoToast } from "~src/components/ui/sonner";
import { Button } from "~src/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~src/components/ui/tabs";
import { Input } from "~src/components/ui/input";
import { SpaceAvatar } from "~src/components/levelIcons";
import { Modal, ModalBody, ModalField, ModalFooter, ModalHeader } from "~src/components/ui/modal";
import type { SavedSpace } from "~src/types";
import { SettingRow, SettingsSection } from "./shared";
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

/** Replace the current route (a stale space link), so Back doesn't return to it. */
function replaceRoute(path: string) {
  window.location.replace(`#${path}`);
}

/**
 * Settings › Spaces: the one home for managing spaces (order, name, look,
 * deletion). A space is the top level of everything the user saved, so these
 * are deliberate settings, not quick actions on the rail or the sidebar.
 *
 * TASK-58: tabs over a form. One tab per space (rail order) sits right above
 * the settings it opens, so picking a space edits it in place; the form below
 * is the same rows as every Settings page (label, description, control).
 * Changes apply as they are made, so switching tabs never drops typed changes.
 * The route still names the space.
 */
export function SpacesTab() {
  const { savedSpaces, activeSpaceId } = useSavedSpacesStore();
  // Array order: the order the rail shows, and the index reorderSpaces moves.
  const sorted = savedSpaces;
  const routeId = spaceIdFromRoute(useRoute());
  const routed = routeId ? sorted.find((s) => s.id === routeId) : undefined;
  const selected = routed ?? sorted.find((s) => s.id === activeSpaceId) ?? sorted[0];
  // A link to a space that is gone (deleted here or on another device) opens the current one.
  useEffect(() => { if (routeId && !routed) replaceRoute(SPACES_ROUTE); }, [routeId, routed]);

  if (sorted.length === 0 || !selected) {
    return <p className="text-sm font-sans text-fg-subtle">No spaces yet. Saving a tab creates one.</p>;
  }

  return (
    // Switching tabs replaces the route: Back and Escape leave Settings, not step through tabs.
    <Tabs value={selected.id} onValueChange={(id) => replaceRoute(`${SPACES_ROUTE}/${encodeURIComponent(id)}`)} className="flex flex-col gap-7">
      <TabsList aria-label="Spaces" className="flex-wrap justify-start rounded-none border-b border-ink/10 pb-3">
        {sorted.map((space) => (
          <TabsTrigger key={space.id} value={space.id} className="max-w-[12rem]">
            <SpaceAvatar space={space} size={20} active={space.id === selected.id || space.id === activeSpaceId} />
            <span className="truncate">{space.name}</span>
          </TabsTrigger>
        ))}
      </TabsList>
      {sorted.map((space, i) => (
        <TabsContent key={space.id} value={space.id} className="focus-visible:ring-0">
          <SpaceForm space={space} index={i} count={sorted.length} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

/**
 * The chosen space's settings, as Settings rows. Changes apply as they are
 * made (a name or abbreviation on Enter or leaving the field, a colour or the
 * order on click): spaces live on this device first, so there is nothing to
 * submit. The tab above follows at once.
 */
function SpaceForm({ space, index, count }: { space: SavedSpace; index: number; count: number }) {
  const { updateSavedSpace, reorderSpaces } = useSavedSpacesStore();
  const [name, setName] = useState(space.name);
  const [abbreviation, setAbbreviation] = useState(space.abbreviation ?? "");
  // Follow edits made elsewhere (another device, the rail).
  useEffect(() => { setName(space.name); setAbbreviation(space.abbreviation ?? ""); }, [space.name, space.abbreviation]);

  const commitName = () => {
    const next = name.trim();
    if (!next) { setName(space.name); return; }
    if (next !== space.name) updateSavedSpace({ ...space, name: next });
  };
  const commitAbbreviation = () => {
    const next = abbreviation.trim();
    if (next !== (space.abbreviation ?? "")) updateSavedSpace({ ...space, abbreviation: next || undefined });
  };
  const onEnter = (commit: () => void) => (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") { e.preventDefault(); commit(); } };
  const color = space.color ?? "";

  return (
    <div className="flex flex-col gap-12" aria-label={`${space.name} settings`} role="group">
      <SettingsSection title="Details" icon={SlidersHorizontal} subtitle="Name, letters, colour and order of this space.">
      <SettingRow label="Name" description="Shown on the rail and across your workspace.">
        {(controlProps) => (
          <Input {...controlProps} id="space-name" placeholder="e.g. Work" value={name} onChange={e => setName(e.target.value)}
            onBlur={commitName} onKeyDown={onEnter(commitName)} className="w-full" />
        )}
      </SettingRow>
      <SettingRow label="Abbreviation" description="Up to 2 letters on the rail. Empty uses the name's first letters.">
        {(controlProps) => (
          <Input {...controlProps} id="space-abbreviation" value={abbreviation} onChange={e => setAbbreviation(e.target.value.slice(0, 2))}
            placeholder={space.name.slice(0, 2).toUpperCase()}
            onBlur={commitAbbreviation} onKeyDown={onEnter(commitAbbreviation)} className="w-full" />
        )}
      </SettingRow>
      <SettingRow label="Color" description="The space's colour on the rail.">
        {(controlProps) => (
          <div className="flex items-center justify-between gap-1" role="group" {...controlProps}>
            {SPACE_COLORS.map(c => (
              <button key={c || "default"} type="button" onClick={() => { if (c !== color) updateSavedSpace({ ...space, color: c || undefined }); }}
                aria-label={`${SPACE_COLOR_NAMES[c] ?? c} color`} aria-pressed={color === c}
                className={`h-4 w-4 shrink-0 rounded-full border-2 outline-none transition-all focus-visible:ring-1 focus-visible:ring-ring ${color === c ? "border-ink/70 scale-110" : "border-transparent hover:border-ink/30"}`}
                style={{ backgroundColor: c || "hsl(var(--ink) / 0.15)" }} />
            ))}
          </div>
        )}
      </SettingRow>
      {count > 1 && (
        <SettingRow label="Order" description={`Position ${index + 1} of ${count} on the rail.`}>
          {(controlProps) => (
            <div className="flex items-center gap-2" role="group" {...controlProps}>
              <Button variant="ghost" size="sm" disabled={index === 0} onClick={() => reorderSpaces(index, index - 1)}>
                <Icon icon={ChevronUp} size="sm" /> Move up
              </Button>
              <Button variant="ghost" size="sm" disabled={index === count - 1} onClick={() => reorderSpaces(index, index + 1)}>
                <Icon icon={ChevronDown} size="sm" /> Move down
              </Button>
            </div>
          )}
        </SettingRow>
      )}
      </SettingsSection>
      <DangerZone space={space} />
    </div>
  );
}

/**
 * Deleting a space removes everything saved in it, on every synced device, so
 * it asks for the space's name before it goes. Undo stays. The last space can
 * go too (TASK-37):
 * zero spaces is a valid workspace, and the next save creates the default
 * space again.
 */
function DeleteSpaceDialog({ space, open, onOpenChange }: { space: SavedSpace; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { removeSavedSpace, addSavedSpace, setActiveSpace } = useSavedSpacesStore();
  const [typed, setTyped] = useState("");
  useEffect(() => { if (open) setTyped(""); }, [open]);
  const { projects, tabs } = countOf(space);
  const matches = typed.trim() === space.name.trim();

  const remove = () => {
    onOpenChange(false);
    removeSavedSpace(space);
    showUndoToast(`Deleted space "${space.name}"`, () => {
      addSavedSpace(space);
      // Undoing the last space's deletion selects it again.
      if (!useSavedSpacesStore.getState().activeSpaceId) setActiveSpace(space.id);
    });
    navigate(SPACES_ROUTE);
  };

  return (
    <Modal kind="alert" size="s" open={open} onOpenChange={onOpenChange}>
      <ModalHeader title={`Delete “${space.name}”?`}
        description={`This removes ${plural(projects, "project")} and ${plural(tabs, "tab")} in this space, on every synced device.`} />
      <ModalBody>
        <ModalField htmlFor="confirm-space-name" label={<>Type <span className="text-fg">{space.name}</span> to confirm</>}>
          {/* Enter may confirm here: the typed name is the safeguard (modal standard §8). */}
          <Input id="confirm-space-name" placeholder="Type it exactly as shown" value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off" className="w-full"
            onKeyDown={e => { if (e.key === "Enter" && matches) remove(); }} />
        </ModalField>
      </ModalBody>
      <ModalFooter primary={{ label: "Delete space", tone: "destructive", disabled: !matches, onClick: remove }} />
    </Modal>
  );
}

function DangerZone({ space }: { space: SavedSpace }) {
  const [open, setOpen] = useState(false);
  const { projects, tabs } = countOf(space);
  return (
    <SettingsSection title="Danger zone" icon={ShieldAlert} subtitle="Delete this space and everything in it.">
      <SettingRow label="Delete this space" description={`Removes ${plural(projects, "project")} and ${plural(tabs, "tab")} on every synced device.`}>
        <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
          Delete space…
        </Button>
      </SettingRow>
      <DeleteSpaceDialog space={space} open={open} onOpenChange={setOpen} />
    </SettingsSection>
  );
}
