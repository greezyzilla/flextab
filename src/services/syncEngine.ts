import * as Y from "yjs";
import { doc, encodeState, persistState } from "~src/lib/yjsDoc";
import { useAuthStore } from "~src/store/useAuthStore";
import { useSyncStore } from "~src/store/useSyncStore";
import { loadTokens, getDeviceId, fetchSyncRevision, API_BASE_URL } from "./api";
import { setStoredRevision } from "./revision";
// Structured sync (PUT /api/sync) is handled by the background service worker.
// Hydration is Yjs-only (the WS channel sends the server's stored state), so the
// Yjs doc is the single source of truth and there's no REST/Yjs double-merge.
import type { SyncStatus } from "~src/store/useSyncStore";

function setStatus(status: SyncStatus) {
  useSyncStore.getState().setStatus(status);
}
function markSynced() {
  useSyncStore.getState().markSynced();
}

const WS_RECONNECT_BASE_MS = 3000;
const WS_RECONNECT_MAX_MS = 60000;

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
          // Another device pushed a structured snapshot — adopt the new server
          // revision so our next push isn't stale.
          void seedServerRevision();
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

// --- Seed the server revision ---
// Hydration happens over the WS Yjs channel (the server sends its stored state
// on connect and merges ours). Here we only fetch the current server revision so
// the background's structured push can use optimistic concurrency (base_revision).

async function seedServerRevision(): Promise<boolean> {
  const rev = await fetchSyncRevision();
  if (rev === null) return false;
  await setStoredRevision(rev);
  markSynced();
  return true;
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

  // Seed the revision, then connect — the WS channel hydrates the Yjs doc.
  if (useAuthStore.getState().isAuthenticated) {
    setStatus("connecting");
    await seedServerRevision();
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
  const ok = await seedServerRevision();
  if (ws && ws.readyState === WebSocket.OPEN) {
    pushFullState();
    setStatus("online");
  } else {
    connectWebSocket(); // sets its own status
  }
  if (!ok) setStatus(ws && ws.readyState === WebSocket.OPEN ? "online" : "error");
  return ok;
}
