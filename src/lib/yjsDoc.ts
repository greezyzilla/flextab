import * as Y from "yjs";
import { spacesSignature } from "./spacesSignature";
import { isGroupColor } from "./groupColors";
export { spacesSignature as lightSpacesSig } from "./spacesSignature";
import type { SavedSpace, SavedProject, SavedCategory, SavedGroup, SavedTab, GroupConfig } from "~src/types";

export const doc = new Y.Doc();
export const spacesArray = doc.getArray<Y.Map<unknown>>("spaces");

/** Atomic Yjs payload + origin (background + page share this key). */
export const PERSIST_KEY = "flextab_yjs_state";

/**
 * How PERSIST_KEY was produced:
 * - `page` — live doc `encodeState()` from a newtab/popup (CRDT-merge on apply)
 * - `snapshot` — plain spaces rebuilt into a fresh doc (OCC writeback; must replace)
 */
export type PersistOrigin = "page" | "snapshot";
// Read-only compatibility with releases that stored origin separately.
export const PERSIST_ORIGIN_KEY = "flextab_yjs_origin";

type PersistedUpdate = { version: 1; origin: PersistOrigin; data: number[] };

function isBytes(value: unknown): value is number[] {
  return Array.isArray(value) && value.length > 0 &&
    value.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255);
}

/** Accept legacy arrays for hydration; new writers always use an atomic envelope. */
export function readPersistedUpdate(value: unknown): PersistedUpdate | null {
  if (isBytes(value)) return { version: 1, origin: "page", data: value };
  if (!value || typeof value !== "object") return null;
  const entry = value as Partial<PersistedUpdate>;
  if (entry.version !== 1 || (entry.origin !== "page" && entry.origin !== "snapshot") ||
      !isBytes(entry.data)) return null;
  return { version: 1, origin: entry.origin, data: entry.data };
}

function storageEnvelope(data: number[], origin: PersistOrigin): PersistedUpdate {
  return { version: 1, origin, data };
}

/** When true, persistState is a no-op — used while applying an external writeback. */
let suppressPersist = false;

// Single-flight + coalesce (FE-C2): concurrent observe/update handlers used to
// fire unbounded `void persistState()` writes that could complete out of order.
// One in-flight write; further requests mark dirty and get one trailing write
// of the latest encodeState after the flight finishes.
let persistInFlight: Promise<void> | null = null;
let persistQueued = false;

/** False means absent, never unreadable. Validate before touching the live doc. */
export async function loadPersistedState(): Promise<boolean> {
  const result = await chrome.storage.local.get(PERSIST_KEY);
  if (result[PERSIST_KEY] === undefined) {
    // Missing workspace with surviving sync history is not a new installation.
    // Seeding defaults here could turn that history into apparent deletions.
    for (const key of ["flextab_merge_base", "flextab_sync_revision", "flextab_landed_snapshot"]) {
      const history = await chrome.storage.local.get(key);
      if (history[key] !== undefined && history[key] !== null) {
        throw new Error("Workspace is missing but sync history remains");
      }
    }
    return false;
  }
  decodeSpacesFromStorage(result[PERSIST_KEY]);
  const update = readPersistedUpdate(result[PERSIST_KEY])!;
  Y.applyUpdate(doc, new Uint8Array(update.data));
  return true;
}

async function writePersistSnapshot(): Promise<void> {
  if (suppressPersist) return;
  const state = encodeState();
  await chrome.storage.local.set({
    [PERSIST_KEY]: storageEnvelope(Array.from(state), "page"),
  });
}

/**
 * Persist current Yjs state to chrome.storage (multi-tab CRDT peer write).
 * Serialized + coalesced so rapid doc updates never race last-write-wins
 * out of order (FE-C2).
 */
export async function persistState(): Promise<void> {
  if (suppressPersist) return;

  if (persistInFlight) {
    persistQueued = true;
    await persistInFlight;
    // If a race left work after the flight cleared, start another pass.
    if (persistQueued && !persistInFlight) {
      return persistState();
    }
    return;
  }

  persistInFlight = (async () => {
    try {
      do {
        persistQueued = false;
        await writePersistSnapshot();
      } while (persistQueued && !suppressPersist);
    } finally {
      persistInFlight = null;
    }
  })();

  await persistInFlight;
  if (persistQueued && !persistInFlight) {
    return persistState();
  }
}

/**
 * Resolves once no persist write is in flight or queued, so an update reload
 * never cuts a write in half. Starts no write of its own.
 */
export async function flushPersist(): Promise<void> {
  while (persistInFlight) await persistInFlight.catch(() => {});
}

/**
 * Encode plain spaces into a Yjs update byte array suitable for PERSIST_KEY.
 * Uses a throwaway doc so the background worker can write without a live UI doc.
 */
export function encodeSpacesAsStorage(spaces: SavedSpace[]): number[] {
  const temp = new Y.Doc();
  try {
    const arr = temp.getArray<Y.Map<unknown>>("spaces");
    temp.transact(() => {
      arr.push(spaces.map(spaceToYMap));
    });
    return Array.from(Y.encodeStateAsUpdate(temp));
  } finally {
    temp.destroy();
  }
}

/** Decode a PERSIST_KEY blob into plain spaces (throwaway doc). */
export function decodeSpacesFromStorage(value: unknown): SavedSpace[] {
  const update = readPersistedUpdate(value);
  if (!update) throw new Error("Invalid persisted workspace format");
  const temp = new Y.Doc();
  try {
    Y.applyUpdate(temp, new Uint8Array(update.data));
    const arr = temp.getArray<Y.Map<unknown>>("spaces");
    return arr.toArray().map(yMapToSpace);
  } finally {
    temp.destroy();
  }
}

/** Write plain spaces as a replace-snapshot (OCC merge land). Origin = snapshot. */
export async function persistSpacesSnapshot(spaces: SavedSpace[]): Promise<void> {
  await chrome.storage.local.set({
    [PERSIST_KEY]: storageEnvelope(encodeSpacesAsStorage(spaces), "snapshot"),
  });
}

/**
 * Apply an external PERSIST_KEY write into the live doc.
 * - `page`: Y.applyUpdate (CRDT merge) so concurrent newtab edits combine
 * - `snapshot`: setSpaces replace (fresh-doc OCC blob cannot be CRDT-merged safely)
 * Skips re-persist during apply; after a CRDT merge that changed content, persists
 * the union once so storage converges.
 * Returns true if the live tree content changed.
 */
export function applyExternalPersistUpdate(
  data: number[],
  origin: PersistOrigin = "page",
): boolean {
  if (!Array.isArray(data) || data.length === 0) return false;

  if (origin === "snapshot") {
    let next: SavedSpace[];
    try {
      next = decodeSpacesFromStorage(data);
    } catch (_) {
      return false;
    }
    if (spacesSignature(next) === spacesSignature(getSpaces())) return false;
    suppressPersist = true;
    try {
      setSpaces(next);
    } finally {
      suppressPersist = false;
    }
    return true;
  }

  // Multi-tab peer: merge remote encodeState into this doc.
  const before = spacesSignature(getSpaces());
  suppressPersist = true;
  try {
    Y.applyUpdate(doc, new Uint8Array(data));
  } catch (_) {
    suppressPersist = false;
    return false;
  }
  suppressPersist = false;
  const after = spacesSignature(getSpaces());
  if (before === after) return false;
  // Publish the merged union so other tabs / background see both sides' edits.
  void persistState();
  return true;
}

let externalBridgeInstalled = false;

/**
 * When another context updates PERSIST_KEY (peer newtab or OCC snapshot writeback),
 * merge or replace into this page's live doc (FE-A1 / FE-A2).
 */
export function installExternalPersistBridge(): void {
  if (externalBridgeInstalled) return;
  if (!chrome.storage?.onChanged) return;
  externalBridgeInstalled = true;
  let eventSequence = 0;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[PERSIST_KEY]) return;
    const sequence = ++eventSequence;
    const value = changes[PERSIST_KEY].newValue;
    const update = readPersistedUpdate(value);
    if (!update) return;
    if (!Array.isArray(value)) {
      applyExternalPersistUpdate(update.data, update.origin);
      return;
    }
    // Legacy onChanged deltas omit an unchanged origin. Read both keys together,
    // and discard a delayed lookup if another event or storage write superseded it.
    void (async () => {
      try {
        const current = await chrome.storage.local.get([PERSIST_KEY, PERSIST_ORIGIN_KEY]);
        if (sequence !== eventSequence ||
            JSON.stringify(current[PERSIST_KEY]) !== JSON.stringify(value)) return;
        const origin = current[PERSIST_ORIGIN_KEY] as PersistOrigin | undefined;
        if (origin !== undefined && origin !== "page" && origin !== "snapshot") return;
        applyExternalPersistUpdate(update.data, origin ?? "page");
      } catch (_) { /* Never guess an origin after a failed storage read. */ }
    })();
  });
}

// =====================================================================
// Yjs → Plain object conversion
// =====================================================================

function yMapToTab(m: Y.Map<unknown>): SavedTab {
  return {
    id: m.get("id") as string,
    url: m.get("url") as string,
    title: m.get("title") as string,
    favicon: m.get("favicon") as string,
    order: m.get("order") as number,
  };
}

function yMapToGroup(m: Y.Map<unknown>): SavedGroup {
  const tabs = m.get("tabs") as Y.Array<Y.Map<unknown>>;
  const kind = m.get("kind") as GroupConfig["kind"] | undefined;
  const color = m.get("color");
  return {
    id: m.get("id") as string,
    name: m.get("name") as string,
    tabs: tabs ? tabs.toArray().map(yMapToTab) : [],
    order: m.get("order") as number,
    ...(kind ? { config: { kind } } : {}),
    ...(isGroupColor(color) ? { color } : {}),
  };
}

function yMapToCategory(m: Y.Map<unknown>): SavedCategory {
  const groups = m.get("groups") as Y.Array<Y.Map<unknown>>;
  return {
    id: m.get("id") as string,
    name: m.get("name") as string,
    groups: groups ? groups.toArray().map(yMapToGroup) : [],
    order: m.get("order") as number,
  };
}

function yMapToProject(m: Y.Map<unknown>): SavedProject {
  const categories = m.get("categories") as Y.Array<Y.Map<unknown>>;
  return {
    id: m.get("id") as string,
    name: m.get("name") as string,
    categories: categories ? categories.toArray().map(yMapToCategory) : [],
    order: m.get("order") as number,
  };
}

function yMapToSpace(m: Y.Map<unknown>): SavedSpace {
  const projects = m.get("projects") as Y.Array<Y.Map<unknown>>;
  const icon = m.get("icon") as string | undefined;
  const color = m.get("color") as string | undefined;
  const abbreviation = m.get("abbreviation") as string | undefined;
  return {
    id: m.get("id") as string,
    name: m.get("name") as string,
    ...(icon ? { icon } : {}),
    ...(color ? { color } : {}),
    ...(abbreviation ? { abbreviation } : {}),
    projects: projects ? projects.toArray().map(yMapToProject) : [],
    order: m.get("order") as number,
  };
}

export function getSpaces(): SavedSpace[] {
  return spacesArray.toArray().map(yMapToSpace);
}

// =====================================================================
// Plain object → Yjs conversion
// =====================================================================

function tabToYMap(t: SavedTab): Y.Map<unknown> {
  const m = new Y.Map<unknown>();
  m.set("id", t.id);
  m.set("url", t.url);
  m.set("title", t.title);
  m.set("favicon", t.favicon);
  m.set("order", t.order ?? 0);
  return m;
}

function groupToYMap(g: SavedGroup): Y.Map<unknown> {
  const m = new Y.Map<unknown>();
  m.set("id", g.id);
  m.set("name", g.name);
  m.set("order", g.order ?? 0);
  if (g.config?.kind) m.set("kind", g.config.kind);
  if (g.color) m.set("color", g.color);
  const tabs = new Y.Array<Y.Map<unknown>>();
  tabs.push(g.tabs.map(tabToYMap));
  m.set("tabs", tabs);
  return m;
}

function categoryToYMap(c: SavedCategory): Y.Map<unknown> {
  const m = new Y.Map<unknown>();
  m.set("id", c.id);
  m.set("name", c.name);
  m.set("order", c.order ?? 0);
  const groups = new Y.Array<Y.Map<unknown>>();
  groups.push(c.groups.map(groupToYMap));
  m.set("groups", groups);
  return m;
}

function projectToYMap(p: SavedProject): Y.Map<unknown> {
  const m = new Y.Map<unknown>();
  m.set("id", p.id);
  m.set("name", p.name);
  m.set("order", p.order ?? 0);
  const categories = new Y.Array<Y.Map<unknown>>();
  categories.push(p.categories.map(categoryToYMap));
  m.set("categories", categories);
  return m;
}

function spaceToYMap(s: SavedSpace): Y.Map<unknown> {
  const m = new Y.Map<unknown>();
  m.set("id", s.id);
  m.set("name", s.name);
  m.set("icon", s.icon || "");
  m.set("color", s.color || "");
  m.set("abbreviation", s.abbreviation || "");
  m.set("order", s.order ?? 0);
  const projects = new Y.Array<Y.Map<unknown>>();
  projects.push(s.projects.map(projectToYMap));
  m.set("projects", projects);
  return m;
}

/** Replace all spaces in the Yjs doc with the given array. */
export function setSpaces(spaces: SavedSpace[]) {
  // Yjs transactions batch notifications; they do not roll back on exceptions.
  // Finish all fallible conversion before deleting anything from the live doc.
  const replacement = spaces.map(spaceToYMap);
  doc.transact(() => {
    spacesArray.delete(0, spacesArray.length);
    spacesArray.push(replacement);
  });
}

// =====================================================================
// Traversal helpers (find Y.Map by ID in nested arrays)
// =====================================================================

function findInArray(arr: Y.Array<Y.Map<unknown>>, id: string): { map: Y.Map<unknown>; index: number } | null {
  for (let i = 0; i < arr.length; i++) {
    const m = arr.get(i);
    if (m.get("id") === id) return { map: m, index: i };
  }
  return null;
}

export function findSpace(id: string) {
  return findInArray(spacesArray, id);
}

export function findProject(spaceId: string, projectId: string) {
  const space = findSpace(spaceId);
  if (!space) return null;
  const projects = space.map.get("projects") as Y.Array<Y.Map<unknown>>;
  return projects ? findInArray(projects, projectId) : null;
}

export function findCategory(spaceId: string, projectId: string, categoryId: string) {
  const project = findProject(spaceId, projectId);
  if (!project) return null;
  const categories = project.map.get("categories") as Y.Array<Y.Map<unknown>>;
  return categories ? findInArray(categories, categoryId) : null;
}

export function findGroup(spaceId: string, projectId: string, categoryId: string, groupId: string) {
  const category = findCategory(spaceId, projectId, categoryId);
  if (!category) return null;
  const groups = category.map.get("groups") as Y.Array<Y.Map<unknown>>;
  return groups ? findInArray(groups, groupId) : null;
}

// =====================================================================
// Mutation helpers
// =====================================================================

export function addSpace(space: SavedSpace) {
  doc.transact(() => {
    spacesArray.push([spaceToYMap(space)]);
  });
}

export function removeSpace(id: string) {
  doc.transact(() => {
    const found = findSpace(id);
    if (found) spacesArray.delete(found.index, 1);
  });
}

export function updateSpace(space: SavedSpace) {
  doc.transact(() => {
    const found = findSpace(space.id);
    if (!found) return;
    found.map.set("name", space.name);
    found.map.set("icon", space.icon || "");
    found.map.set("color", space.color || "");
    found.map.set("abbreviation", space.abbreviation || "");
    if (space.order !== undefined) found.map.set("order", space.order);
    // Replace projects subtree
    const newProjects = new Y.Array<Y.Map<unknown>>();
    newProjects.push(space.projects.map(projectToYMap));
    found.map.set("projects", newProjects);
  });
}

/** Reconstruct a Y.Map from plain JSON (nested arrays become Y.Arrays of Y.Maps). */
function rebuildYMap(obj: Record<string, unknown>): Y.Map<unknown> {
  const m = new Y.Map<unknown>();
  for (const [key, val] of Object.entries(obj)) {
    if (Array.isArray(val)) {
      const yArr = new Y.Array<Y.Map<unknown>>();
      yArr.push(val.map((v: unknown) => rebuildYMap(v as Record<string, unknown>)));
      m.set(key, yArr);
    } else {
      m.set(key, val);
    }
  }
  return m;
}

/**
 * Put the items in the order they are shown (by `order`, then position), so
 * the indexes callers pass (from the shown, order-sorted list) match the
 * array. Groups and tabs can differ: a new group is stored last
 * with order -1 to show first, and a reorder then moved the wrong group.
 * Already in order (spaces, projects, categories, most lists): nothing moves.
 */
function inDisplayOrder(arr: Y.Array<Y.Map<unknown>>): void {
  const want = arr.toArray()
    // Every *ToYMap writer sets a numeric order (`?? 0`).
    .map((m, i) => ({ id: m.get("id"), o: m.get("order") as number, i }))
    .sort((a, b) => a.o - b.o || a.i - b.i)
    .map((x) => x.id);
  for (let i = 0; i < want.length; i++) {
    if (arr.get(i).get("id") === want[i]) continue;
    let j = i + 1;
    while (arr.get(j).get("id") !== want[i]) j++;
    const json = arr.get(j).toJSON() as Record<string, unknown>;
    arr.delete(j, 1);
    arr.insert(i, [rebuildYMap(json)]);
  }
}

/** Move the item shown at `oldIndex` to `newIndex` (indexes in shown order), then renumber `order`. */
export function reorderInArray(arr: Y.Array<Y.Map<unknown>>, oldIndex: number, newIndex: number) {
  doc.transact(() => {
    inDisplayOrder(arr);
    const item = arr.get(oldIndex);
    // Serialize to plain JSON before deleting to avoid clone issues with nested Y types
    const json = item.toJSON();
    arr.delete(oldIndex, 1);
    arr.insert(newIndex, [rebuildYMap(json as Record<string, unknown>)]);
    // Reassign order values
    for (let i = 0; i < arr.length; i++) {
      arr.get(i).set("order", i);
    }
  });
}

export function addProject(spaceId: string, project: SavedProject) {
  doc.transact(() => {
    const space = findSpace(spaceId);
    if (!space) return;
    const projects = space.map.get("projects") as Y.Array<Y.Map<unknown>>;
    projects.push([projectToYMap(project)]);
  });
}

export function removeProject(spaceId: string, projectId: string) {
  doc.transact(() => {
    const space = findSpace(spaceId);
    if (!space) return;
    const projects = space.map.get("projects") as Y.Array<Y.Map<unknown>>;
    const found = findInArray(projects, projectId);
    if (found) projects.delete(found.index, 1);
  });
}

export function updateProject(spaceId: string, project: SavedProject) {
  doc.transact(() => {
    const found = findProject(spaceId, project.id);
    if (!found) return;
    found.map.set("name", project.name);
    if (project.order !== undefined) found.map.set("order", project.order);
    const newCategories = new Y.Array<Y.Map<unknown>>();
    newCategories.push(project.categories.map(categoryToYMap));
    found.map.set("categories", newCategories);
  });
}

export function addCategory(spaceId: string, projectId: string, category: SavedCategory) {
  doc.transact(() => {
    const project = findProject(spaceId, projectId);
    if (!project) return;
    const categories = project.map.get("categories") as Y.Array<Y.Map<unknown>>;
    categories.push([categoryToYMap(category)]);
  });
}

export function removeCategory(spaceId: string, projectId: string, categoryId: string) {
  doc.transact(() => {
    const project = findProject(spaceId, projectId);
    if (!project) return;
    const categories = project.map.get("categories") as Y.Array<Y.Map<unknown>>;
    const found = findInArray(categories, categoryId);
    if (found) categories.delete(found.index, 1);
  });
}

export function updateCategory(spaceId: string, projectId: string, category: SavedCategory) {
  doc.transact(() => {
    const found = findCategory(spaceId, projectId, category.id);
    if (!found) return;
    found.map.set("name", category.name);
    if (category.order !== undefined) found.map.set("order", category.order);
    const newGroups = new Y.Array<Y.Map<unknown>>();
    newGroups.push(category.groups.map(groupToYMap));
    found.map.set("groups", newGroups);
  });
}

export function addGroup(spaceId: string, projectId: string, categoryId: string, group: SavedGroup) {
  doc.transact(() => {
    const category = findCategory(spaceId, projectId, categoryId);
    if (!category) return;
    const groups = category.map.get("groups") as Y.Array<Y.Map<unknown>>;
    groups.push([groupToYMap(group)]);
  });
}

export function removeGroup(spaceId: string, projectId: string, categoryId: string, groupId: string) {
  doc.transact(() => {
    const category = findCategory(spaceId, projectId, categoryId);
    if (!category) return;
    const groups = category.map.get("groups") as Y.Array<Y.Map<unknown>>;
    const found = findInArray(groups, groupId);
    if (found) groups.delete(found.index, 1);
  });
}

export function updateGroup(spaceId: string, projectId: string, categoryId: string, group: SavedGroup) {
  doc.transact(() => {
    const found = findGroup(spaceId, projectId, categoryId, group.id);
    if (!found) return;
    found.map.set("name", group.name);
    if (group.order !== undefined) found.map.set("order", group.order);
    if (group.color) found.map.set("color", group.color);
    else if (found.map.has("color")) found.map.delete("color");
    const newTabs = new Y.Array<Y.Map<unknown>>();
    newTabs.push(group.tabs.map(tabToYMap));
    found.map.set("tabs", newTabs);
  });
}

export function addTab(spaceId: string, projectId: string, categoryId: string, groupId: string, tab: SavedTab) {
  doc.transact(() => {
    const group = findGroup(spaceId, projectId, categoryId, groupId);
    if (!group) return;
    const tabs = group.map.get("tabs") as Y.Array<Y.Map<unknown>>;
    tabs.push([tabToYMap({ ...tab, order: tab.order ?? tabs.length })]);
  });
}

export function addTabsBatch(spaceId: string, projectId: string, categoryId: string, groupId: string, tabs: SavedTab[]) {
  doc.transact(() => {
    const group = findGroup(spaceId, projectId, categoryId, groupId);
    if (!group) return;
    const yTabs = group.map.get("tabs") as Y.Array<Y.Map<unknown>>;
    yTabs.push(tabs.map(t => tabToYMap({ ...t, order: t.order ?? yTabs.length })));
  });
}

/** An Unsorted group exists only while it holds tabs. */
function pruneIfEmptyUnsorted(spaceId: string, projectId: string, categoryId: string, groupId: string) {
  const category = findCategory(spaceId, projectId, categoryId);
  if (!category) return;
  const groups = category.map.get("groups") as Y.Array<Y.Map<unknown>>;
  const found = findInArray(groups, groupId);
  if (!found || found.map.get("kind") !== "unsorted") return;
  const tabs = found.map.get("tabs") as Y.Array<Y.Map<unknown>> | undefined;
  if (!tabs || tabs.length === 0) groups.delete(found.index, 1);
}

export function removeTab(spaceId: string, projectId: string, categoryId: string, groupId: string, tabId: string) {
  doc.transact(() => {
    const group = findGroup(spaceId, projectId, categoryId, groupId);
    if (!group) return;
    const tabs = group.map.get("tabs") as Y.Array<Y.Map<unknown>>;
    const found = findInArray(tabs, tabId);
    if (found) tabs.delete(found.index, 1);
    pruneIfEmptyUnsorted(spaceId, projectId, categoryId, groupId);
  });
}

export function updateTab(spaceId: string, projectId: string, categoryId: string, groupId: string, tab: SavedTab) {
  doc.transact(() => {
    const group = findGroup(spaceId, projectId, categoryId, groupId);
    if (!group) return;
    const tabs = group.map.get("tabs") as Y.Array<Y.Map<unknown>>;
    const found = findInArray(tabs, tab.id);
    if (!found) return;
    found.map.set("url", tab.url);
    found.map.set("title", tab.title);
    found.map.set("favicon", tab.favicon);
    if (tab.order !== undefined) found.map.set("order", tab.order);
  });
}

export function moveTabBetweenGroups(
  spaceId: string, projectId: string, categoryId: string,
  sourceGroupId: string, targetGroupId: string, tabId: string, insertIndex?: number,
) {
  doc.transact(() => {
    const category = findCategory(spaceId, projectId, categoryId);
    if (!category) return;
    const groups = category.map.get("groups") as Y.Array<Y.Map<unknown>>;

    const srcGroup = findInArray(groups, sourceGroupId);
    const tgtGroup = findInArray(groups, targetGroupId);
    if (!srcGroup || !tgtGroup) return;

    const srcTabs = srcGroup.map.get("tabs") as Y.Array<Y.Map<unknown>>;
    const tgtTabs = tgtGroup.map.get("tabs") as Y.Array<Y.Map<unknown>>;
    const found = findInArray(srcTabs, tabId);
    if (!found) return;
    // insertIndex is a shown position; renumbering below follows the array.
    inDisplayOrder(srcTabs);
    inDisplayOrder(tgtTabs);
    const at = findInArray(srcTabs, tabId)!;

    // Serialize before deleting to avoid clone issues
    const tabData = yMapToTab(at.map);
    srcTabs.delete(at.index, 1);

    // Reorder source tabs
    for (let i = 0; i < srcTabs.length; i++) srcTabs.get(i).set("order", i);

    // Insert into target
    const idx = insertIndex ?? tgtTabs.length;
    tgtTabs.insert(idx, [tabToYMap(tabData)]);
    for (let i = 0; i < tgtTabs.length; i++) tgtTabs.get(i).set("order", i);
    pruneIfEmptyUnsorted(spaceId, projectId, categoryId, sourceGroupId);
  });
}

// =====================================================================
// Binary state (for persistence & sync)
// =====================================================================

export function encodeState(): Uint8Array {
  return Y.encodeStateAsUpdate(doc);
}

export function applyUpdate(update: Uint8Array) {
  Y.applyUpdate(doc, update);
}

export function mergeRemoteState(remoteState: Uint8Array) {
  Y.applyUpdate(doc, remoteState);
}

/** Move a group from one category to another (cross-boundary). */
export function moveGroupToCategory(
  srcSpaceId: string, srcProjectId: string, srcCategoryId: string, groupId: string,
  tgtSpaceId: string, tgtProjectId: string, tgtCategoryId: string,
) {
  doc.transact(() => {
    const srcCat = findCategory(srcSpaceId, srcProjectId, srcCategoryId);
    const tgtCat = findCategory(tgtSpaceId, tgtProjectId, tgtCategoryId);
    if (!srcCat || !tgtCat) return;
    const srcGroups = srcCat.map.get("groups") as Y.Array<Y.Map<unknown>>;
    const tgtGroups = tgtCat.map.get("groups") as Y.Array<Y.Map<unknown>>;
    if (!findInArray(srcGroups, groupId)) return;
    // Renumbering below follows the array: keep it in shown order.
    inDisplayOrder(srcGroups);
    inDisplayOrder(tgtGroups);
    const found = findInArray(srcGroups, groupId)!;
    // Serialize before deleting to avoid clone issues with nested types
    const groupData = yMapToGroup(found.map);
    srcGroups.delete(found.index, 1);
    // Reorder source
    for (let i = 0; i < srcGroups.length; i++) srcGroups.get(i).set("order", i);
    // Reconstruct and insert at end of target
    groupData.order = tgtGroups.length;
    tgtGroups.push([groupToYMap(groupData)]);
  });
}

/** Move a tab across any boundary (different group, category, project, or space). */
export function moveTabCrossBoundary(
  srcSpaceId: string, srcProjectId: string, srcCategoryId: string, srcGroupId: string, tabId: string,
  tgtSpaceId: string, tgtProjectId: string, tgtCategoryId: string, tgtGroupId: string, insertIndex?: number,
) {
  doc.transact(() => {
    const srcGroup = findGroup(srcSpaceId, srcProjectId, srcCategoryId, srcGroupId);
    const tgtGroup = findGroup(tgtSpaceId, tgtProjectId, tgtCategoryId, tgtGroupId);
    if (!srcGroup || !tgtGroup) return;
    const srcTabs = srcGroup.map.get("tabs") as Y.Array<Y.Map<unknown>>;
    const tgtTabs = tgtGroup.map.get("tabs") as Y.Array<Y.Map<unknown>>;
    if (!findInArray(srcTabs, tabId)) return;
    // insertIndex is a shown position; renumbering below follows the array.
    inDisplayOrder(srcTabs);
    inDisplayOrder(tgtTabs);
    const found = findInArray(srcTabs, tabId)!;
    // Serialize before deleting to avoid clone issues with nested types
    const tabData = yMapToTab(found.map);
    srcTabs.delete(found.index, 1);
    for (let i = 0; i < srcTabs.length; i++) srcTabs.get(i).set("order", i);
    const idx = insertIndex ?? tgtTabs.length;
    tgtTabs.insert(idx, [tabToYMap(tabData)]);
    for (let i = 0; i < tgtTabs.length; i++) tgtTabs.get(i).set("order", i);
    pruneIfEmptyUnsorted(srcSpaceId, srcProjectId, srcCategoryId, srcGroupId);
  });
}

/** Move a category from one project to another. */
export function moveCategoryToProject(
  srcSpaceId: string, srcProjectId: string, categoryId: string,
  tgtSpaceId: string, tgtProjectId: string,
) {
  doc.transact(() => {
    const srcProj = findProject(srcSpaceId, srcProjectId);
    const tgtProj = findProject(tgtSpaceId, tgtProjectId);
    if (!srcProj || !tgtProj) return;
    const srcCats = srcProj.map.get("categories") as Y.Array<Y.Map<unknown>>;
    const tgtCats = tgtProj.map.get("categories") as Y.Array<Y.Map<unknown>>;
    const found = findInArray(srcCats, categoryId);
    if (!found) return;
    // Serialize before deleting to avoid clone issues with nested types
    const catData = yMapToCategory(found.map);
    srcCats.delete(found.index, 1);
    for (let i = 0; i < srcCats.length; i++) srcCats.get(i).set("order", i);
    catData.order = tgtCats.length;
    tgtCats.push([categoryToYMap(catData)]);
  });
}

/** Move a project from one space to another. */
export function moveProjectToSpace(srcSpaceId: string, projectId: string, tgtSpaceId: string) {
  doc.transact(() => {
    const srcSpace = findSpace(srcSpaceId);
    const tgtSpace = findSpace(tgtSpaceId);
    if (!srcSpace || !tgtSpace) return;
    const srcProjects = srcSpace.map.get("projects") as Y.Array<Y.Map<unknown>>;
    const tgtProjects = tgtSpace.map.get("projects") as Y.Array<Y.Map<unknown>>;
    const found = findInArray(srcProjects, projectId);
    if (!found) return;
    // Serialize before deleting to avoid clone issues with nested types
    const projData = yMapToProject(found.map);
    srcProjects.delete(found.index, 1);
    for (let i = 0; i < srcProjects.length; i++) srcProjects.get(i).set("order", i);
    projData.order = tgtProjects.length;
    tgtProjects.push([projectToYMap(projData)]);
  });
}

/** Clear all Yjs state and persisted storage. Used on logout / account switch. */
export async function clearState(): Promise<void> {
  doc.transact(() => {
    spacesArray.delete(0, spacesArray.length);
  });
  try {
    await chrome.storage.local.remove(PERSIST_KEY);
  } catch (_) { /* storage unavailable */ }
}

