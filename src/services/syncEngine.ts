import { doc, getSpaces, setSpaces, persistState, installExternalPersistBridge } from "~src/lib/yjsDoc";
import { spacesSignature } from "~src/lib/spacesSignature";
export { spacesSignature } from "~src/lib/spacesSignature";
import { useAuthStore } from "~src/store/useAuthStore";
import { useSyncStore } from "~src/store/useSyncStore";
import { useSyncConflict } from "~src/store/useSyncConflict";
import { useMergeConflict } from "~src/store/useMergeConflict";
import { useSettingsStore } from "~src/store/useSettingsStore";
import { apiFetch, loadTokens, getDeviceId, API_BASE_URL } from "./api";
import { applyPendingLandedSnapshot, LANDED_SNAPSHOT_KEY } from "./landedSnapshot";
import { setStoredRevision } from "./revision";
import { getMergeBase, setMergeBase } from "./mergeBase";
import {
  setConflictPending,
  clearConflictPending,
  loadConflictPending,
  loadOccConflictPayload,
  saveOccConflictPayload,
} from "./conflictState";
import { ensureDefaultData, syncActiveSelection } from "~src/store/useSavedSpacesStore";
import { mergeSpacesGuest } from "./spacesMerge";
import { spaceTabCount } from "./spacesTree";
import { merge3, type Conflict, type Resolutions } from "./spacesMerge3";
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
  // Guest / signed-out: only "paused" is valid (never offline/online/error).
  const next =
    !useAuthStore.getState().isAuthenticated && status !== "paused"
      ? "paused"
      : status;
  useSyncStore.getState().setStatus(next);
}
function markSynced() {
  useSyncStore.getState().markSynced();
}

// Recompute whether local data has drifted from the last state the server
// confirmed (the merge-base). Signature-based so it matches the reconcile
// layer's notion of "changed", including metadata and order edits.
// Not authenticated → nothing to sync to, so never dirty. Cheap: getMergeBase
// resolves from an in-memory cache after first load.
async function recomputeDirty() {
  if (!useAuthStore.getState().isAuthenticated) {
    useSyncStore.getState().setDirty(false);
    return;
  }
  const base = await getMergeBase();
  const dirty = spacesSignature(getSpaces()) !== spacesSignature(base ?? []);
  useSyncStore.getState().setDirty(dirty);
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

export type Reconciliation =
  | { kind: "conflict" } // guest↔account sign-in (no shared history) → coarse prompt
  | { kind: "item-conflict"; spaces: SavedSpace[]; conflicts: Conflict[] } // 3-way per-item
  | { kind: "apply"; spaces: SavedSpace[] };

/**
 * Guest / no-merge-base reconciliation only (FE-C3).
 * - explicit login + BOTH sides have real tabs → conflict (SyncConflictModal)
 * - server only → take server; local only → keep local; both → mergeSpacesGuest
 * Live OCC with a base uses decideReconciliation3 → merge3.
 */
export function decideReconciliation(server: SavedSpace[], local: SavedSpace[], freshLogin: boolean): Reconciliation {
  const serverReal = hasRealData(server);
  const localReal = hasRealData(local);

  if (freshLogin && serverReal && localReal) return { kind: "conflict" };

  let spaces: SavedSpace[];
  if (serverReal && !localReal) spaces = server;
  else if (!serverReal && localReal) spaces = local;
  else if (serverReal && localReal) spaces = mergeSpacesGuest(server, local);
  else spaces = local.length ? local : server;
  return { kind: "apply", spaces };
}

/**
 * Production reconcile decision (FE-C3). With a common ancestor (`base`) we use
 * merge3 (edit vs delete, item conflicts). Without a base (first sync / legacy)
 * we fall back to guest 2-way decideReconciliation — never silent OCC on 2-way.
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

/**
 * Guest↔account SyncConflictModal choice (no merge-base).
 * "merge" → mergeSpacesGuest; not used for OCC item-conflicts (those use merge3 resolutions).
 */
export function resolveChoice(choice: "merge" | "server" | "local", server: SavedSpace[], local: SavedSpace[]): SavedSpace[] {
  return choice === "merge" ? mergeSpacesGuest(server, local) : choice === "server" ? server : local;
}

/**
 * Apply a resolved tree locally and open the door for background OCC push.
 *
 * Merge-base / "clean" must only reflect **server-confirmed** state (FE-B1):
 * - `serverConfirmed: true` — this tree is exactly what GET /api/sync just returned
 *   (or a force-restore overwrite); safe as merge-base without a push.
 * - otherwise leave merge-base alone; background `onStructuredPushLanded` advances
 *   it after a confirmed PUT. `recomputeDirty` then correctly shows unsynced local.
 */
function applyResolution(
  spaces: SavedSpace[],
  opts: { selectFirst?: boolean; serverConfirmed?: boolean } = {},
) {
  const { selectFirst = false, serverConfirmed = false } = opts;
  // Only rewrite the doc when the data actually changed; otherwise the rewrite
  // would persist → push → broadcast → re-pull → push, looping forever.
  const changed = spacesSignature(spaces) !== spacesSignature(getSpaces());
  if (changed) setSpaces(spaces);
  if (getSpaces().length === 0) ensureDefaultData();
  // After login, jump to the first space/group; otherwise keep a valid selection.
  if (selectFirst || changed) syncActiveSelection(selectFirst);
  markHydrated(); // enable the structured push → uploads when local still needs OCC
  if (serverConfirmed) {
    // setMergeBase updates its cache after storage completes. Compare against
    // that confirmed base, not the previous one captured before its write.
    void setMergeBase(spaces).then(() => {
      markSynced();
      void recomputeDirty();
    });
  } else {
    void recomputeDirty();
  }
  void clearConflictPending(); // resolver finished (or pull overwrite); not the same as push-clean
  connectWebSocket(); // realtime change-notifier
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
    // Durable so reload / other contexts know a resolver is needed (FE-B3).
    void saveOccConflictPayload({
      base,
      server,
      local,
      conflicts: decision.conflicts,
    });
    setStatus("online");
    return; // wait for resolveMergeConflicts()
  }

  // Only treat as server-confirmed when the applied tree is exactly the pull —
  // merged/local-only trees still need a confirmed PUT before merge-base moves.
  applyResolution(decision.spaces, {
    selectFirst: freshLogin,
    serverConfirmed: spacesSignature(decision.spaces) === spacesSignature(server),
  });
}

/** Resolve a guest↔account conflict with the user's choice. */
export function resolveConflict(choice: "merge" | "server" | "local") {
  const s = pendingServer, l = pendingLocal;
  pendingServer = pendingLocal = null;
  useSyncConflict.getState().close();
  if (!s || !l) return;
  // Jump to first space/group after resolving; always needs push (not server-only GET).
  applyResolution(resolveChoice(choice, s, l), { selectFirst: true, serverConfirmed: false });
}

/** Apply the user's per-item choices to a pending 3-way conflict. Re-runs merge3
 *  with the resolutions to produce the final tree, then enables upload; merge-base
 *  advances when the background push lands (FE-A1 / FE-B1). */
export function resolveMergeConflicts(resolutions: Resolutions) {
  const b = pendingMergeBase, s = pendingServer, l = pendingLocal;
  pendingServer = pendingLocal = pendingMergeBase = pendingMergeConflicts = null;
  useMergeConflict.getState().close();
  if (!s || !l) return;
  const { merged } = merge3(b, s, l, resolutions);
  applyResolution(merged, { serverConfirmed: false });
}

/** Dismiss the resolver without resolving ("ignore for now"): turn auto-sync OFF
 *  and stay on local data (like staying on your own branch). Flipping auto-sync
 *  off tears the engine down; turning it back on restarts it → the next reconcile
 *  re-detects the still-unresolved conflict and reopens the resolver, so the user
 *  can't silently sync past it. */
export function dismissMergeConflicts() {
  // Keep durable OCC payload if present so re-enable auto-sync reopens resolver.
  const b = pendingMergeBase, s = pendingServer, l = pendingLocal, c = pendingMergeConflicts;
  pendingServer = pendingLocal = pendingMergeBase = pendingMergeConflicts = null;
  useMergeConflict.getState().close();
  if (s && l && c) {
    void saveOccConflictPayload({ base: b, server: s, local: l, conflicts: c });
  } else {
    setConflictPending(true);
  }
  useSettingsStore.getState().setAutoSync(false);
  setStatus("paused");
}

/**
 * If the background SW deferred a true OCC 409 (or a prior item-conflict was
 * persisted), reopen the per-item resolver. Returns true when a modal was opened.
 */
export async function adoptStoredOccConflict(): Promise<boolean> {
  const p = await loadOccConflictPayload();
  if (!p || p.conflicts.length === 0) return false;
  pendingServer = p.server;
  pendingLocal = p.local;
  pendingMergeBase = p.base;
  pendingMergeConflicts = p.conflicts;
  useMergeConflict.getState().open(p.conflicts, p.base, p.server, p.local);
  setConflictPending(true);
  return true;
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

    // The token rides in the Sec-WebSocket-Protocol header (not the query
    // string, which lands in proxy/access logs). The server echoes back
    // "flextab.v1" to satisfy the browser's subprotocol negotiation.
    const wsUrl = API_BASE_URL.replace(/^http/, "ws") +
      "/api/ws?device_id=" + encodeURIComponent(did);
    ws = new WebSocket(wsUrl, ["flextab.v1", "flextab.bearer." + tokens.access_token]);

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
  // Receive peer page writes; OCC acknowledgements are rebased separately below.
  installExternalPersistBridge();
  // Every local edit: persist, and re-evaluate drift from the merge-base so the
  // "unsynced changes" hint stays live even when the sync engine is paused.
  const handler = () => { void persistState(); void recomputeDirty(); };
  doc.on("update", handler);
  // Auth flips (e.g. sign-in with auto-sync off never starts the engine) and
  // background pushes advancing the merge-base both change dirtiness without a
  // local doc edit — recompute on those too.
  const unsubAuth = useAuthStore.subscribe((state, prev) => {
    void recomputeDirty();
    // Session drop (logout / expired token): clear any leftover Offline/error
    // so the indicator shows Local only / Guest, not Offline.
    if (!state.isAuthenticated && prev?.isAuthenticated) {
      setStatus("paused");
    }
  });
  const applyLanded = () => {
    void applyPendingLandedSnapshot().then(() => adoptStoredOccConflict()).catch(() => {
      // Receipt remains durable; retry on next sync/open after storage recovers.
      setStatus("error");
    });
  };
  const onStorage = (changes: { [k: string]: chrome.storage.StorageChange }, area: string) => {
    if (area === "local" && changes["flextab_merge_base"]) void recomputeDirty();
    if (area === "local" && changes[LANDED_SNAPSHOT_KEY]?.newValue) applyLanded();
  };
  chrome.storage?.onChanged?.addListener(onStorage);
  unsubPersist = () => {
    doc.off("update", handler);
    unsubAuth();
    chrome.storage?.onChanged?.removeListener(onStorage);
  };
  applyLanded(); // recover an OCC acknowledgement left by a closed page/worker
  void recomputeDirty(); // seed on load (authenticated + auto-sync off with pending edits)
  void loadConflictPending(); // seed the persisted conflict flag (survives reload)
  // Reopen resolver if SW stashed an OCC conflict while auto-sync was off / no engine.
  void adoptStoredOccConflict();
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

  // Background may have stashed a true OCC conflict while no newtab was open.
  if (await adoptStoredOccConflict()) {
    markHydrated();
    setStatus("online");
    connectWebSocket();
    return;
  }

  try { await applyPendingLandedSnapshot(); }
  catch (_) { setStatus("error"); return; }
  if (await adoptStoredOccConflict()) {
    markHydrated();
    setStatus("online");
    connectWebSocket();
    return;
  }
  await reconcile(fresh);
}

// Pauses the engine — called on every isAuthenticated/autoSync flip and on
// unmount, not just a real sign-out (a transient auth drop, e.g. a
// refresh-token race, goes through here too). The merge base must survive
// this: it's cleared explicitly in useAuthStore's logout() instead, so a
// spurious session drop + re-login doesn't invalidate the 3-way-merge
// ancestor and manufacture a conflict out of nothing.
export function stopSyncEngine() {
  disconnectWebSocket();
  clearHydrated();
  // Torn down with a conflict still unresolved (e.g. auto-sync toggled off from
  // settings while the resolver was open, bypassing "Ignore for now") → persist
  // the conflict flag so it isn't silently dropped. The dismiss path already set
  // it and nulled pendingMergeConflicts before this runs, so it's not double-set.
  if (pendingMergeConflicts) setConflictPending(true);
  pendingServer = pendingLocal = pendingMergeBase = pendingMergeConflicts = null;
  useSyncConflict.getState().close();
  useMergeConflict.getState().close();
  setStatus("paused");
}

/** Manual "Sync now": re-pull + reconcile (auto-merge, no prompt). */
export async function syncNow(): Promise<boolean> {
  if (!useAuthStore.getState().isAuthenticated) return false;
  setStatus("syncing");
  try { await applyPendingLandedSnapshot(); }
  catch (_) { setStatus("error"); return false; }
  if (await adoptStoredOccConflict()) return false;
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
    // Restore/overwrite: GET is authoritative — merge-base may advance immediately.
    applyResolution(mapBeToLocal(data.spaces), { selectFirst: true, serverConfirmed: true });
    return true;
  } catch (_) {
    setStatus("offline");
    connectWebSocket();
    return false;
  }
}
