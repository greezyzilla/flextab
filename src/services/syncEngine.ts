import { doc, getSpaces, setSpaces, persistState } from "~src/lib/yjsDoc";
import { useAuthStore } from "~src/store/useAuthStore";
import { useSyncStore } from "~src/store/useSyncStore";
import { useSyncConflict } from "~src/store/useSyncConflict";
import { useMergeConflict } from "~src/store/useMergeConflict";
import { useSettingsStore } from "~src/store/useSettingsStore";
import { apiFetch, loadTokens, getDeviceId, API_BASE_URL } from "./api";
import { setStoredRevision } from "./revision";
import { getMergeBase, setMergeBase, clearMergeBase } from "./mergeBase";
import { ensureDefaultData, syncActiveSelection } from "~src/store/useSavedSpacesStore";
import { mergeSpaces, spaceTabCount } from "./spacesMerge";
import { merge3, type Conflict, type Resolutions } from "./spacesMerge3";
import type { SavedSpace } from "~src/types";
import type { SyncStatus } from "~src/store/useSyncStore";

export { mergeSpaces } from "./spacesMerge";

// Model: the server's structured data (SQL) is the source of truth; the Yjs doc
// is the local store. Hydration pulls the server state and reconciles it with
// local. On an explicit login where BOTH local (guest) and the account have
// real data, we ask the user how to resolve (merge / keep account / keep local)
// instead of silently overwriting. The WS channel is a "data changed" notifier
// that triggers a re-pull. Structured upload (PUT /api/sync, OCC) is done by the
// background worker, gated on the hydration flag below.

function setStatus(status: SyncStatus) {
  useSyncStore.getState().setStatus(status);
}
function markSynced() {
  useSyncStore.getState().markSynced();
}

const WS_RECONNECT_BASE_MS = 3000;
const WS_RECONNECT_MAX_MS = 60000;
const SYNC_HYDRATED_KEY = "flextab_sync_hydrated";
const FRESH_LOGIN_KEY = "flextab_fresh_login";

// --- BE → local mapping ---

interface BeTab { id: string; url: string; title: string; favicon: string; order: number; }
interface BeGroup { id: string; name: string; order: number; tabs: BeTab[]; }
interface BeCategory { id: string; name: string; order: number; groups: BeGroup[]; }
interface BeProject { id: string; name: string; order: number; categories: BeCategory[]; }
interface BeSpace { id: string; name: string; icon: string; color?: string; abbreviation?: string; order: number; projects: BeProject[]; }

function mapBeToLocal(spaces: BeSpace[]): SavedSpace[] {
  return (spaces || []).map(s => ({
    id: s.id, name: s.name, icon: s.icon || undefined,
    color: s.color || undefined, abbreviation: s.abbreviation || undefined, order: s.order,
    projects: (s.projects || []).map(p => ({
      id: p.id, name: p.name, order: p.order,
      categories: (p.categories || []).map(c => ({
        id: c.id, name: c.name, order: c.order,
        groups: (c.groups || []).map(g => ({
          id: g.id, name: g.name, order: g.order,
          tabs: (g.tabs || []).map(t => ({
            id: t.id, url: t.url, title: t.title, favicon: t.favicon, order: t.order,
          })),
        })),
      })),
    })),
  }));
}

// --- reconcile helpers ---

function totalTabs(spaces: SavedSpace[]): number {
  return spaces.reduce((sum, s) => sum + spaceTabCount(s), 0);
}

function hasRealData(spaces: SavedSpace[]): boolean {
  return totalTabs(spaces) > 0;
}

// --- hydration gate (read by the background worker before its structured push) ---

let sessionHydrated = false;

function markHydrated() {
  sessionHydrated = true;
  try { void chrome.storage.local.set({ [SYNC_HYDRATED_KEY]: true }); } catch (_) { /* ok */ }
}

function clearHydrated() {
  sessionHydrated = false;
  try { void chrome.storage.local.remove(SYNC_HYDRATED_KEY); } catch (_) { /* ok */ }
}

// --- reconcile ---

let pendingServer: SavedSpace[] | null = null;
let pendingLocal: SavedSpace[] | null = null;
// A 3-way reconcile awaiting the user's per-item resolution. While set, pushes /
// re-pulls hold off (like an unmerged git working tree) so we don't act on data
// with unresolved conflicts.
let pendingMergeBase: SavedSpace[] | null = null;
let pendingMergeConflicts: Conflict[] | null = null;

/** Canonical structural signature — used to skip no-op writes (avoids a
 *  push → broadcast → re-pull → push loop once the data has converged). */
export function spacesSignature(spaces: SavedSpace[]): string {
  return JSON.stringify(spaces.map(s => ({
    i: s.id, n: s.name,
    p: (s.projects || []).map(p => ({
      i: p.id, n: p.name,
      c: (p.categories || []).map(c => ({
        i: c.id, n: c.name,
        g: (c.groups || []).map(g => ({
          i: g.id, n: g.name,
          t: (g.tabs || []).map(t => ({ i: t.id, u: t.url })),
        })),
      })),
    })),
  })));
}

export type Reconciliation =
  | { kind: "conflict" } // guest↔account sign-in (no shared history) → coarse prompt
  | { kind: "item-conflict"; spaces: SavedSpace[]; conflicts: Conflict[] } // 3-way per-item
  | { kind: "apply"; spaces: SavedSpace[] };

/**
 * Pure decision for reconciling pulled server data with local data (2-way, no base).
 * - explicit login + BOTH sides have real tabs → conflict (ask the user)
 * - server only → take server; local only → keep local; both → lossless merge
 */
export function decideReconciliation(server: SavedSpace[], local: SavedSpace[], freshLogin: boolean): Reconciliation {
  const serverReal = hasRealData(server);
  const localReal = hasRealData(local);

  if (freshLogin && serverReal && localReal) return { kind: "conflict" };

  let spaces: SavedSpace[];
  if (serverReal && !localReal) spaces = server;
  else if (!serverReal && localReal) spaces = local;
  else if (serverReal && localReal) spaces = mergeSpaces(server, local);
  else spaces = local.length ? local : server;
  return { kind: "apply", spaces };
}

/**
 * Pure 3-way decision. With a common ancestor (`base`) we can tell an edit from a
 * delete, so we auto-merge non-conflicting changes and surface only true conflicts
 * (edit-edit, delete-vs-edit) for the user to resolve — treating tabs as sacred.
 * Without a base (first sync / legacy install) we fall back to the safe 2-way union.
 */
export function decideReconciliation3(
  base: SavedSpace[] | null,
  server: SavedSpace[],
  local: SavedSpace[],
  freshLogin: boolean,
): Reconciliation {
  if (!base) return decideReconciliation(server, local, freshLogin);
  const { merged, conflicts } = merge3(base, server, local);
  return conflicts.length > 0
    ? { kind: "item-conflict", spaces: merged, conflicts }
    : { kind: "apply", spaces: merged };
}

/** Pure: the resulting spaces for a user's conflict choice. */
export function resolveChoice(choice: "merge" | "server" | "local", server: SavedSpace[], local: SavedSpace[]): SavedSpace[] {
  return choice === "merge" ? mergeSpaces(server, local) : choice === "server" ? server : local;
}

function applyResolution(spaces: SavedSpace[], selectFirst = false) {
  // Only rewrite the doc when the data actually changed; otherwise the rewrite
  // would persist → push → broadcast → re-pull → push, looping forever.
  const changed = spacesSignature(spaces) !== spacesSignature(getSpaces());
  if (changed) setSpaces(spaces);
  if (getSpaces().length === 0) ensureDefaultData();
  // After login, jump to the first space/group; otherwise keep a valid selection.
  if (selectFirst || changed) syncActiveSelection(selectFirst);
  markSynced();
  markHydrated();      // enable the structured push → uploads the resolved state (OCC)
  // The converged tree is what both sides now agree on → the next 3-way's base.
  void setMergeBase(getSpaces());
  connectWebSocket();  // realtime change-notifier
}

async function reconcile(freshLogin: boolean): Promise<void> {
  let server: SavedSpace[];
  try {
    const data = await apiFetch<{ spaces: BeSpace[]; revision: number }>("/api/sync");
    server = mapBeToLocal(data.spaces);
    await setStoredRevision(data.revision);
  } catch (_) {
    // Offline — can't reconcile. Keep local; don't upload (would risk a blind
    // overwrite). Connect so we retry when back online.
    setStatus("offline");
    connectWebSocket();
    return;
  }

  const local = getSpaces();
  const base = await getMergeBase();
  const decision = decideReconciliation3(base, server, local, freshLogin);

  if (decision.kind === "conflict") {
    pendingServer = server;
    pendingLocal = local;
    useSyncConflict.getState().open(server, local);
    setStatus("online");
    return; // wait for resolveConflict()
  }

  if (decision.kind === "item-conflict") {
    pendingServer = server;
    pendingLocal = local;
    pendingMergeBase = base;
    pendingMergeConflicts = decision.conflicts;
    useMergeConflict.getState().open(decision.conflicts, base, server, local);
    setStatus("online");
    return; // wait for resolveMergeConflicts()
  }

  applyResolution(decision.spaces, freshLogin);
}

/** Resolve a guest↔account conflict with the user's choice. */
export function resolveConflict(choice: "merge" | "server" | "local") {
  const s = pendingServer, l = pendingLocal;
  pendingServer = pendingLocal = null;
  useSyncConflict.getState().close();
  if (!s || !l) return;
  applyResolution(resolveChoice(choice, s, l), true); // jump to the first space/group after resolving
}

/** Apply the user's per-item choices to a pending 3-way conflict. Re-runs merge3
 *  with the resolutions to produce the final tree, then converges (upload + base). */
export function resolveMergeConflicts(resolutions: Resolutions) {
  const b = pendingMergeBase, s = pendingServer, l = pendingLocal;
  pendingServer = pendingLocal = pendingMergeBase = pendingMergeConflicts = null;
  useMergeConflict.getState().close();
  if (!s || !l) return;
  const { merged } = merge3(b, s, l, resolutions);
  applyResolution(merged);
}

/** Dismiss the resolver without resolving ("ignore for now"): turn auto-sync OFF
 *  and stay on local data (like staying on your own branch). Flipping auto-sync
 *  off tears the engine down; turning it back on restarts it → the next reconcile
 *  re-detects the still-unresolved conflict and reopens the resolver, so the user
 *  can't silently sync past it. */
export function dismissMergeConflicts() {
  pendingServer = pendingLocal = pendingMergeBase = pendingMergeConflicts = null;
  useMergeConflict.getState().close();
  useSettingsStore.getState().setAutoSync(false);
  setStatus("paused");
}

// --- WebSocket (realtime change-notifier) ---

let ws: WebSocket | null = null;
let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let wsReconnectDelay = WS_RECONNECT_BASE_MS;

function connectWebSocket() {
  if (ws) return;
  if (!useAuthStore.getState().isAuthenticated) return;

  setStatus("connecting");
  Promise.all([loadTokens(), getDeviceId()]).then(([tokens, did]) => {
    if (!tokens) { setStatus("offline"); return; }

    const wsUrl = API_BASE_URL.replace(/^http/, "ws") +
      "/api/ws?token=" + tokens.access_token + "&device_id=" + encodeURIComponent(did);
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      wsReconnectDelay = WS_RECONNECT_BASE_MS;
      setStatus("online");
      markSynced();
      // Reconcile on every (re)connect, not just the pre-hydration case: a device
      // that was offline while another device changed data would otherwise stay
      // stale until it happened to push. The 3-way merge makes this safe (a no-op
      // when converged). Skip while a conflict prompt is pending resolution.
      if (!pendingServer) void reconcile(false);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "sync" && !pendingServer) {
          // Skip while a conflict prompt is awaiting the user's choice.
          if (msg.entity_type === "restore") {
            // Another device restored a version — the server is authoritative;
            // overwrite local so a merge can't resurrect the discarded tree.
            void pullAndOverwrite();
          } else if (msg.entity_type === "full") {
            // Another device changed data — re-pull and merge (no conflict prompt).
            void reconcile(false);
          }
        }
      } catch (_) { /* ignore parse errors */ }
    };

    ws.onclose = () => {
      ws = null;
      if (useAuthStore.getState().isAuthenticated) {
        setStatus("offline");
        wsReconnectTimer = setTimeout(connectWebSocket, wsReconnectDelay);
        wsReconnectDelay = Math.min(wsReconnectDelay * 2, WS_RECONNECT_MAX_MS);
      }
    };

    ws.onerror = () => { ws?.close(); };
  });
}

function disconnectWebSocket() {
  if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null; }
  wsReconnectDelay = WS_RECONNECT_BASE_MS;
  if (ws) { ws.onclose = null; ws.close(); ws = null; }
}

// --- Local persistence (always-on, independent of auth/sync) ---

let unsubPersist: (() => void) | null = null;

export function startLocalPersistence() {
  if (unsubPersist) return;
  const handler = () => { void persistState(); };
  doc.on("update", handler);
  unsubPersist = () => doc.off("update", handler);
}

export function stopLocalPersistence() {
  if (unsubPersist) { unsubPersist(); unsubPersist = null; }
}

// --- Public API ---

export async function startSyncEngine() {
  clearHydrated();
  if (!useAuthStore.getState().isAuthenticated) return;

  setStatus("connecting");
  // Was this triggered by an explicit login (vs a returning-session restore)?
  let fresh = false;
  try {
    const f = await chrome.storage.local.get(FRESH_LOGIN_KEY);
    fresh = f[FRESH_LOGIN_KEY] === true;
    if (fresh) await chrome.storage.local.remove(FRESH_LOGIN_KEY);
  } catch (_) { /* ok */ }

  await reconcile(fresh);
}

export function stopSyncEngine() {
  disconnectWebSocket();
  clearHydrated();
  pendingServer = pendingLocal = pendingMergeBase = pendingMergeConflicts = null;
  useSyncConflict.getState().close();
  useMergeConflict.getState().close();
  void clearMergeBase(); // per-account — forget on sign-out
  setStatus("paused");
}

/** Manual "Sync now": re-pull + reconcile (auto-merge, no prompt). */
export async function syncNow(): Promise<boolean> {
  if (!useAuthStore.getState().isAuthenticated) return false;
  setStatus("syncing");
  await reconcile(false);
  return true;
}

/** Force-pull the server state and overwrite local — used after a snapshot
 *  restore, where the server is authoritative and a merge would undo the restore. */
export async function pullAndOverwrite(): Promise<boolean> {
  if (!useAuthStore.getState().isAuthenticated) return false;
  setStatus("syncing");
  try {
    const data = await apiFetch<{ spaces: BeSpace[]; revision: number }>("/api/sync");
    await setStoredRevision(data.revision);
    applyResolution(mapBeToLocal(data.spaces), true);
    return true;
  } catch (_) {
    setStatus("offline");
    connectWebSocket();
    return false;
  }
}
