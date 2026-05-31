import * as Y from "yjs";
import { doc, encodeState, getSpaces, setSpaces, persistState } from "~src/lib/yjsDoc";
import { useAuthStore } from "~src/store/useAuthStore";
import { loadTokens, apiFetch, API_BASE_URL } from "./api";
// Structured sync (PUT /api/sync) is handled by background service worker
import type { SavedSpace } from "~src/types";

const WS_RECONNECT_MS = 3000;

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
let sendingUpdate = false;

function connectWebSocket() {
  if (ws) return;

  loadTokens().then(tokens => {
    if (!tokens) return;

    const wsUrl = API_BASE_URL.replace(/^http/, "ws") + "/api/ws?token=" + tokens.access_token;
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
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
          // Legacy full sync broadcast — pull structured data and merge into Yjs
          pullStructuredAndMerge();
        }
      } catch { /* ignore parse errors */ }
    };

    ws.onclose = () => {
      ws = null;
      if (useAuthStore.getState().isAuthenticated) {
        wsReconnectTimer = setTimeout(connectWebSocket, WS_RECONNECT_MS);
      }
    };

    ws.onerror = () => { ws?.close(); };
  });
}

function disconnectWebSocket() {
  if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null; }
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
      // Create a temporary Yjs doc with BE data, then merge
      const tempDoc = new Y.Doc();
      const tempArray = tempDoc.getArray<Y.Map<unknown>>("spaces");
      // Build Yjs structure from BE data
      const { setSpaces: setTempSpaces } = await import("~src/lib/yjsDoc").then(m => {
        // We can't use setSpaces on the main doc directly, so build from plain
        return { setSpaces: m.setSpaces };
      });
      // Merge by applying BE state as a remote update
      // The simplest approach: if local Yjs has no data, set from BE
      const localSpaces = getSpaces();
      if (localSpaces.length === 0 || (localSpaces.length === 1 && localSpaces[0]?.name === "Personal" && localSpaces[0]?.projects[0]?.categories[0]?.groups[0]?.tabs.length === 0)) {
        // Local is default/empty — use BE data
        setSpaces(beSpaces);
      }
      // If local has data and BE has data, local Yjs is authoritative
      // (Yjs merge will happen via WS updates between devices)
      tempDoc.destroy();
    }
  } catch {
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
  // Yjs state already loaded by hydrateYjs() — set up listeners
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
