import * as Y from "yjs";
import type { SavedSpace, SavedProject, SavedCategory, SavedGroup, SavedTab } from "~src/types";

export const doc = new Y.Doc();
export const spacesArray = doc.getArray<Y.Map<unknown>>("spaces");

const PERSIST_KEY = "flextab_yjs_state";

/** Load Yjs state from chrome.storage. Returns true if state was loaded. */
export async function loadPersistedState(): Promise<boolean> {
  try {
    const result = await chrome.storage.local.get(PERSIST_KEY);
    const data = result[PERSIST_KEY];
    if (data && Array.isArray(data)) {
      Y.applyUpdate(doc, new Uint8Array(data));
      return true;
    }
  } catch { /* storage unavailable */ }
  return false;
}

/** Persist current Yjs state to chrome.storage. */
export async function persistState(): Promise<void> {
  const state = encodeState();
  await chrome.storage.local.set({ [PERSIST_KEY]: Array.from(state) });
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
    description: (m.get("description") as string) || undefined,
    order: m.get("order") as number,
  };
}

function yMapToGroup(m: Y.Map<unknown>): SavedGroup {
  const tabs = m.get("tabs") as Y.Array<Y.Map<unknown>>;
  return {
    id: m.get("id") as string,
    name: m.get("name") as string,
    tabs: tabs ? tabs.toArray().map(yMapToTab) : [],
    order: m.get("order") as number,
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
  return {
    id: m.get("id") as string,
    name: m.get("name") as string,
    ...(icon ? { icon } : {}),
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
  m.set("description", t.description || "");
  m.set("order", t.order ?? 0);
  return m;
}

function groupToYMap(g: SavedGroup): Y.Map<unknown> {
  const m = new Y.Map<unknown>();
  m.set("id", g.id);
  m.set("name", g.name);
  m.set("order", g.order ?? 0);
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
  m.set("order", s.order ?? 0);
  const projects = new Y.Array<Y.Map<unknown>>();
  projects.push(s.projects.map(projectToYMap));
  m.set("projects", projects);
  return m;
}

/** Replace all spaces in the Yjs doc with the given array. */
export function setSpaces(spaces: SavedSpace[]) {
  doc.transact(() => {
    spacesArray.delete(0, spacesArray.length);
    spacesArray.push(spaces.map(spaceToYMap));
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
    if (space.order !== undefined) found.map.set("order", space.order);
    // Replace projects subtree
    const newProjects = new Y.Array<Y.Map<unknown>>();
    newProjects.push(space.projects.map(projectToYMap));
    found.map.set("projects", newProjects);
  });
}

export function reorderInArray(arr: Y.Array<Y.Map<unknown>>, oldIndex: number, newIndex: number) {
  doc.transact(() => {
    const item = arr.get(oldIndex);
    const clone = item.clone() as Y.Map<unknown>;
    arr.delete(oldIndex, 1);
    arr.insert(newIndex, [clone]);
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

export function removeTab(spaceId: string, projectId: string, categoryId: string, groupId: string, tabId: string) {
  doc.transact(() => {
    const group = findGroup(spaceId, projectId, categoryId, groupId);
    if (!group) return;
    const tabs = group.map.get("tabs") as Y.Array<Y.Map<unknown>>;
    const found = findInArray(tabs, tabId);
    if (found) tabs.delete(found.index, 1);
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
    found.map.set("description", tab.description || "");
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

    const clone = found.map.clone() as Y.Map<unknown>;
    srcTabs.delete(found.index, 1);

    // Reorder source tabs
    for (let i = 0; i < srcTabs.length; i++) srcTabs.get(i).set("order", i);

    // Insert into target
    const idx = insertIndex ?? tgtTabs.length;
    tgtTabs.insert(idx, [clone]);
    for (let i = 0; i < tgtTabs.length; i++) tgtTabs.get(i).set("order", i);
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
