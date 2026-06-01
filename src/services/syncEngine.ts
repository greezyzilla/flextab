import * as Y from "yjs";
import { doc, encodeState, getSpaces, setSpaces, persistState } from "~src/lib/yjsDoc";
import { useAuthStore } from "~src/store/useAuthStore";
import { loadTokens, apiFetch, API_BASE_URL } from "./api";
// Structured sync (PUT /api/sync) is handled by background service worker
import type { SavedSpace } from "~src/types";

const WS_RECONNECT_BASE_MS = 3000;
const WS_RECONNECT_MAX_MS = 60000;

// --- BE types ---

interface BeTab { id: string; url: string; title: string; favicon: string; description: string; order: number; }
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
            id: t.id, url: t.url, title: t.title, favicon: t.favicon,
            description: t.description || undefined, order: t.order,
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

  loadTokens().then(tokens => {
    if (!tokens) return;

    const wsUrl = API_BASE_URL.replace(/^http/, "ws") + "/api/ws?token=" + tokens.access_token;
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      // Reset backoff on successful connection
      wsReconnectDelay = WS_RECONNECT_BASE_MS;

      // Send our full state so the server has the latest
      const state = encodeState();
      ws?.send(JSON.stringify({
        type: "yjs_state",
        data: Array.from(state),
      }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "yjs_update" && msg.data) {
          sendingUpdate = true;
          Y.applyUpdate(doc, new Uint8Array(msg.data));
          sendingUpdate = false;
          persistState();
        } else if (msg.type === "yjs_state" && msg.data) {
          sendingUpdate = true;
          Y.applyUpdate(doc, new Uint8Array(msg.data));
          sendingUpdate = false;
          persistState();
        } else if (msg.type === "sync" && msg.entity_type === "full") {
          pullStructuredAndMerge();
        }
      } catch (_) { /* ignore parse errors */ }
    };

    ws.onclose = () => {
      ws = null;
      if (useAuthStore.getState().isAuthenticated) {
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

// Send Yjs update to other clients via WS
function broadcastUpdate(update: Uint8Array) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({
    type: "yjs_update",
    data: Array.from(update),
  }));
}

// --- Initial pull from BE structured data → merge into Yjs ---

async function pullStructuredAndMerge() {
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
  } catch (_) {
    // Offline or error — use local data
  }
}

// --- Doc change listener ---

let unsubDoc: (() => void) | null = null;

function setupDocListener() {
  const handler = (update: Uint8Array, _origin: unknown) => {
    // Persist locally
    persistState();

    // Broadcast to other devices (skip if update came from remote)
    if (!sendingUpdate) {
      broadcastUpdate(update);
    }
  };

  doc.on("update", handler);
  unsubDoc = () => doc.off("update", handler);
}

// --- Public API ---

export async function startSyncEngine() {
  // Clean up any previous listener before setting up a new one
  if (unsubDoc) { unsubDoc(); unsubDoc = null; }
  setupDocListener();

  // Pull BE data and merge if needed
  if (useAuthStore.getState().isAuthenticated) {
    await pullStructuredAndMerge();
    connectWebSocket();
  }
}

export function stopSyncEngine() {
  if (unsubDoc) { unsubDoc(); unsubDoc = null; }
  disconnectWebSocket();
}
