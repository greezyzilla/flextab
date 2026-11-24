// Canonical "save open tabs as a group" write path (FE-B5).
// All UI entry points (content panel, keyboard, Save Session modal, popup)
// should go through here so filtering, favicon conversion, and atomic group
// write stay in one place.
import { v7 as uuidv7 } from "uuid";
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore";
import { faviconToDataUrl } from "~src/utils/favicon";
import type { SavedTab } from "~src/types";
import { rememberDestination } from "~src/lib/recentDestinations";
import { firstGroupOrder } from "~src/lib/defaultPath";

export type SaveTabsTarget = {
  spaceId: string;
  projectId: string;
  categoryId: string;
};

/**
 * The one rule for what can be saved, used by every save path:
 * only web pages. Browser/extension pages (about:, chrome:, chrome-extension:,
 * edge:, brave:, devtools:, view-source:…), data:/blob: URLs and local file:
 * pages are skipped: they don't reopen on another device, and FlexTab's own
 * new tab page would just be saved into itself.
 */
export function isSavableTabUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

export function defaultSavedGroupName(prefix = "Saved"): string {
  const now = new Date();
  return `${prefix} ${now.toLocaleDateString()} ${now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

type ChromeTabLike = {
  url?: string;
  title?: string;
  favIconUrl?: string;
};

function isAlreadySavedTab(t: ChromeTabLike | SavedTab): t is SavedTab {
  return (
    typeof (t as SavedTab).id === "string" &&
    typeof (t as SavedTab).favicon === "string" &&
    typeof (t as SavedTab).url === "string" &&
    !("favIconUrl" in t)
  );
}

/** Convert chrome tabs (or already-built SavedTabs) into ordered SavedTabs. */
export async function toSavedTabs(
  tabs: Array<ChromeTabLike | SavedTab>,
): Promise<SavedTab[]> {
  const out: SavedTab[] = [];
  let order = 0;
  for (const t of tabs) {
    if (isAlreadySavedTab(t)) {
      out.push({ ...t, order: order++ });
      continue;
    }
    if (!isSavableTabUrl(t.url)) continue;
    out.push({
      id: uuidv7(),
      url: t.url || "",
      title: t.title || "Untitled",
      favicon: await faviconToDataUrl(t.favIconUrl || "", t.url),
      order: order++,
    });
  }
  return out;
}

/**
 * Atomically create a group with the given tabs under the target category.
 * Uses a single `addSavedGroup` write (tabs embedded) — not empty-group + batch.
 * Returns null if nothing savable.
 */
export async function saveTabsAsGroup(args: {
  target: SaveTabsTarget;
  name: string;
  tabs: Array<ChromeTabLike | SavedTab>;
  /** Defaults to current category.groups.length from the store. */
  order?: number;
}): Promise<{ groupId: string; tabCount: number } | null> {
  const { target, name } = args;
  const savedTabs = await toSavedTabs(args.tabs);
  if (savedTabs.length === 0) return null;

  const store = useSavedSpacesStore.getState();
  const space = store.savedSpaces.find((s) => s.id === target.spaceId);
  const project = space?.projects.find((p) => p.id === target.projectId);
  const category = project?.categories.find((c) => c.id === target.categoryId);
  if (!category) return null;

  const groupId = uuidv7();
  store.addSavedGroup(target.spaceId, target.projectId, target.categoryId, {
    id: groupId,
    name: name.trim() || defaultSavedGroupName(),
    tabs: savedTabs,
    order: args.order ?? firstGroupOrder(category.groups),
  });
  // Feeds the destination picker's "Recent" row; never blocks the save.
  void rememberDestination({ ...target, groupId });

  return { groupId, tabCount: savedTabs.length };
}
