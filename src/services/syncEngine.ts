import { doc, getSpaces, setSpaces, persistState } from "~src/lib/yjsDoc";
import { useAuthStore } from "~src/store/useAuthStore";
import { useSyncStore } from "~src/store/useSyncStore";
import { useSyncConflict } from "~src/store/useSyncConflict";
import { apiFetch, loadTokens, getDeviceId, API_BASE_URL } from "./api";
import { setStoredRevision } from "./revision";
import { ensureDefaultData, syncActiveSelection } from "~src/store/useSavedSpacesStore";
import type { SavedSpace } from "~src/types";
import type { SyncStatus } from "~src/store/useSyncStore";

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
interface BeSpace { id: string; name: string; icon: string; order: number; projects: BeProject[]; }

function mapBeToLocal(spaces: BeSpace[]): SavedSpace[] {
  return (spaces || []).map(s => ({
    id: s.id, name: s.name, icon: s.icon || undefined, order: s.order,
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

function spaceTabCount(s: SavedSpace): number {
  let n = 0;
  for (const p of s.projects || []) {
    for (const c of p.categories || []) {
      for (const g of c.groups || []) n += g.tabs?.length || 0;
    }
  }
  return n;
}

function totalTabs(spaces: SavedSpace[]): number {
  return spaces.reduce((sum, s) => sum + spaceTabCount(s), 0);
}

function hasRealData(spaces: SavedSpace[]): boolean {
  return totalTabs(spaces) > 0;
}

/**
 * Lossless union: server wins on an id collision (already-synced spaces), all
 * local-only spaces are kept, except the guest's empty default "Personal" which
 * is dropped when the account already has data (it's just placeholder).
 */
export function mergeSpaces(server: SavedSpace[], local: SavedSpace[]): SavedSpace[] {
  const byId = new Map<string, SavedSpace>();
  for (const s of server) byId.set(s.id, s);
  for (const s of local) {
    if (byId.has(s.id)) continue;
    const emptyDefault = s.name === "Personal" && spaceTabCount(s) === 0;
    if (emptyDefault && server.length > 0) continue;
    byId.set(s.id, s);
  }
  return [...byId.values()].map((s, i) => ({ ...s, order: i }));
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

/** Canonical structural signature — used to skip no-op writes (avoids a
 *  push → broadcast → re-pull → push loop once the data has converged). */
function signature(spaces: SavedSpace[]): string {
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

function applyResolution(spaces: SavedSpace[], selectFirst = false) {
  // Only rewrite the doc when the data actually changed; otherwise the rewrite
  // would persist → push → broadcast → re-pull → push, looping forever.
  const changed = signature(spaces) !== signature(getSpaces());
  if (changed) setSpaces(spaces);
  if (getSpaces().length === 0) ensureDefaultData();
  // After login, jump to the first space/group; otherwise keep a valid selection.
  if (selectFirst || changed) syncActiveSelection(selectFirst);
  markSynced();
  markHydrated();      // enable the structured push → uploads the resolved state (OCC)
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
  const serverReal = hasRealData(server);
  const localReal = hasRealData(local);

  // Genuine conflict only on an explicit login where both sides have real data.
  if (freshLogin && serverReal && localReal) {
    pendingServer = server;
    pendingLocal = local;
    useSyncConflict.getState().open(server, local);
    setStatus("online");
    return; // wait for resolveConflict()
  }

  let result: SavedSpace[];
  if (serverReal && !localReal) result = server;            // local was empty/default
  else if (!serverReal && localReal) result = local;        // server empty → keep local
  else if (serverReal && localReal) result = mergeSpaces(server, local); // returning user
  else result = local.length ? local : server;              // both empty-ish
  applyResolution(result, freshLogin);
}

/** Resolve a guest↔account conflict with the user's choice. */
export function resolveConflict(choice: "merge" | "server" | "local") {
  const s = pendingServer, l = pendingLocal;
  pendingServer = pendingLocal = null;
  useSyncConflict.getState().close();
  if (!s || !l) return;
  const result = choice === "merge" ? mergeSpaces(s, l) : choice === "server" ? s : l;
  applyResolution(result, true); // jump to the first space/group after resolving
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
      // If we connected before hydrating (e.g. the initial pull failed offline),
      // reconcile now. Skip while a conflict prompt is pending resolution.
      if (!sessionHydrated && !pendingServer) void reconcile(false);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "sync" && msg.entity_type === "full" && !pendingServer) {
          // Another device changed data — re-pull and merge (no conflict prompt).
          // Skip while a conflict prompt is awaiting the user's choice.
          void reconcile(false);
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
  pendingServer = pendingLocal = null;
  useSyncConflict.getState().close();
  setStatus("paused");
}

/** Manual "Sync now": re-pull + reconcile (auto-merge, no prompt). */
export async function syncNow(): Promise<boolean> {
  if (!useAuthStore.getState().isAuthenticated) return false;
  setStatus("syncing");
  await reconcile(false);
  return true;
}
