import * as Y from "yjs";
import { doc, encodeState, getSpaces, setSpaces, persistState } from "~src/lib/yjsDoc";
import { useAuthStore } from "~src/store/useAuthStore";
import { useSyncStore } from "~src/store/useSyncStore";
import { loadTokens, apiFetch, getDeviceId, API_BASE_URL } from "./api";
// Structured sync (PUT /api/sync) is handled by background service worker
import type { SavedSpace } from "~src/types";
import type { SyncStatus } from "~src/store/useSyncStore";

function setStatus(status: SyncStatus) {
  useSyncStore.getState().setStatus(status);
}
function markSynced() {
  useSyncStore.getState().markSynced();
}

const WS_RECONNECT_BASE_MS = 3000;
const WS_RECONNECT_MAX_MS = 60000;

// --- BE types ---

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

// Yjs persistence delegated to yjsDoc.persistState()

// --- WebSocket for Yjs sync ---

let ws: WebSocket | null = null;
let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let wsReconnectDelay = WS_RECONNECT_BASE_MS;
let sendingUpdate = false;

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
      // Reset backoff on successful connection
      wsReconnectDelay = WS_RECONNECT_BASE_MS;
      setStatus("online");
      markSynced();

      // Send our full state so the server has the latest
      pushFullState();
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if ((msg.type === "yjs_update" || msg.type === "yjs_state") && msg.data) {
          sendingUpdate = true;
          Y.applyUpdate(doc, new Uint8Array(msg.data));
          sendingUpdate = false;
          // Local persistence is handled by the always-on persistence listener.
          markSynced();
        } else if (msg.type === "sync" && msg.entity_type === "full") {
          pullStructuredAndMerge();
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

function pushFullState() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "yjs_state", data: Array.from(encodeState()) }));
}

function disconnectWebSocket() {
  if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null; }
  wsReconnectDelay = WS_RECONNECT_BASE_MS;
  if (ws) { ws.onclose = null; ws.close(); ws = null; }
}

// Send Yjs update to other clients via WS
function broadcastUpdate(update: Uint8Array) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({
    type: "yjs_update",
    data: Array.from(update),
  }));
}

// --- Initial pull from BE structured data → merge into Yjs ---

async function pullStructuredAndMerge(): Promise<boolean> {
  try {
    const data = await apiFetch<{ spaces: BeSpace[]; revision: number }>("/api/sync");
    const beSpaces = mapBeToLocal(data.spaces);
    if (beSpaces.length > 0) {
      const localSpaces = getSpaces();
      // If local is default/empty, replace with BE data
      if (localSpaces.length === 0 || (localSpaces.length === 1 && localSpaces[0]?.name === "Personal" && localSpaces[0]?.projects[0]?.categories[0]?.groups[0]?.tabs.length === 0)) {
        setSpaces(beSpaces);
      }
      // If local has real data, local Yjs is authoritative
      // (Yjs merge happens via WS updates between devices)
    }
    markSynced();
    return true;
  } catch (_) {
    // Offline or error — use local data
    return false;
  }
}

// --- Local persistence (always-on, independent of auth/sync) ---
// Guests and auto-sync-off users still need every Yjs mutation written to
// chrome.storage, so this listener is decoupled from the realtime engine.

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

// --- Broadcast listener (only while the realtime engine is running) ---

let unsubDoc: (() => void) | null = null;

function setupBroadcastListener() {
  const handler = (update: Uint8Array, _origin: unknown) => {
    // Broadcast to other devices (skip if the update came from remote).
    if (!sendingUpdate) broadcastUpdate(update);
  };

  doc.on("update", handler);
  unsubDoc = () => doc.off("update", handler);
}

// --- Public API ---

export async function startSyncEngine() {
  // Clean up any previous listener before setting up a new one
  if (unsubDoc) { unsubDoc(); unsubDoc = null; }
  setupBroadcastListener();

  // Pull BE data and merge if needed
  if (useAuthStore.getState().isAuthenticated) {
    setStatus("connecting");
    await pullStructuredAndMerge();
    connectWebSocket();
  }
}

export function stopSyncEngine() {
  if (unsubDoc) { unsubDoc(); unsubDoc = null; }
  disconnectWebSocket();
  setStatus("paused");
}

/**
 * Manual "Sync now": force a pull + push reconcile regardless of auto-sync.
 * Returns false if not signed in or the sync failed.
 */
export async function syncNow(): Promise<boolean> {
  if (!useAuthStore.getState().isAuthenticated) return false;
  setStatus("syncing");
  const ok = await pullStructuredAndMerge();
  if (ws && ws.readyState === WebSocket.OPEN) {
    pushFullState();
    setStatus("online");
  } else {
    connectWebSocket(); // sets its own status
  }
  if (!ok) setStatus(ws && ws.readyState === WebSocket.OPEN ? "online" : "error");
  return ok;
}
