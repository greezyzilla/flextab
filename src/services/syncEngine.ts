import { markResolutionPush, requestPush, withSyncWriteLock } from "./syncPolicy";
import { CLIENT_TOO_OLD_CLOSE_CODE, clientQuery, markClientTooOld } from "~src/utils/http";
import { syncStructuredSnapshot } from "./structuredSync";
import { clearLimitNotice, saveLimitNotice } from "./syncLimit";
import { recordLandedSnapshot } from "./landedSnapshot";
import { doc, getSpaces, setSpaces, persistState, installExternalPersistBridge } from "~src/lib/yjsDoc";
import { spacesSignature } from "~src/lib/spacesSignature";
import { isGroupColor } from "~src/lib/groupColors";
export { spacesSignature } from "~src/lib/spacesSignature";
import { useAuthStore } from "~src/store/useAuthStore";
import { useSyncStore } from "~src/store/useSyncStore";
import { useSyncConflict } from "~src/store/useSyncConflict";
import { useOverCapNotice } from "~src/store/useOverCapNotice";
import { tabCap, usePlanStore } from "~src/store/usePlanStore";
import { useMergeConflict } from "~src/store/useMergeConflict";
import { useSettingsStore } from "~src/store/useSettingsStore";
import { apiFetch, loadTokens, getDeviceId, API_BASE_URL } from "./api";
import { onServerReachable } from "./serverReachable";
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
import { syncActiveSelection } from "~src/store/useSavedSpacesStore";
import { mergeSpacesGuest } from "./spacesMerge";
import { spaceTabCount } from "./spacesTree";
import { clearKeptOnSignOut, loadKeptOnSignOut } from "./keptWorkspace";
import { merge3, type Conflict, type Resolutions } from "./spacesMerge3";
import { addAccountCopies } from "./keepBoth";
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
// Every failed handshake is logged by Chrome itself (it can't be caught), so a
// server that stays down costs one console error per attempt (TASK-63). Backing
// off to 5 minutes bounds that to about 17 attempts in the first hour per page;
// jitter keeps several pages from retrying in step.
const WS_RECONNECT_MAX_MS = 5 * 60_000;
// Returning to the page retries a waiting socket at once, but not more often
// than this, so flipping between tabs while the server is down stays quiet.
const WS_VISIBLE_RETRY_GAP_MS = 30_000;
const SYNC_HYDRATED_KEY = "flextab_sync_hydrated";
const FRESH_LOGIN_KEY = "flextab_fresh_login";

/**
 * The fresh-login flag is only cleared once a reconcile has acted on it (applied
 * a tree, or the user answered the choice). Clearing it on read lost it when the
 * first run was cancelled by the /me identity change right after sign-in, and the
 * next run then applied local tabs to the account without asking.
 */
async function clearFreshLogin(): Promise<void> {
  try { await chrome.storage.local.remove(FRESH_LOGIN_KEY); } catch (_) { /* ok */ }
}

// --- BE → local mapping ---

interface BeTab { id: string; url: string; title: string; favicon: string; order: number; }
interface BeGroup { id: string; name: string; order: number; tabs: BeTab[]; color?: unknown; config?: { kind?: unknown } | null; }
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
          ...(isGroupColor(g.color) ? { color: g.color } : {}),
          ...(g.config?.kind === "unsorted" ? { config: { kind: "unsorted" as const } } : {}),
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
let engineRunning = false;
// The server closed the socket as too old (TASK-114): no path reconnects it until
// the engine starts again, which the page only does once the update arrived.
let clientTooOld = false;
let engineGeneration = 0;
let authGeneration = 0;
// Capture before waiting for a lock or I/O. An old request must never acquire
// authority from a later login, even when it is the same user logging in again.
function captureSyncSession(): () => boolean {
  const session = authGeneration;
  const signedIn = useAuthStore.getState().isAuthenticated;
  return () => signedIn && session === authGeneration && useAuthStore.getState().isAuthenticated;
}

function automaticSyncActive() {
  return engineRunning && useAuthStore.getState().isAuthenticated && useSettingsStore.getState().autoSync;
}

function markHydrated() {
  if (!automaticSyncActive()) return;
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
// An explicit resolver choice is ready to PUT against the revision that was
// shown. Re-pulling first would rediscover the same conflict and undo the choice.
let manualResolution: Promise<void> | null = null;
// The worker uploads when the local document changes. A choice that leaves the
// document as it is (keeping this device's tabs, or continuing past the over-cap
// notice) changes nothing, so the worker is asked to upload now instead of
// waiting for the 5-minute retry alarm or the next local edit (TASK-39).
function applyUserResolution(spaces: SavedSpace[], selectFirst = false) {
  const work = applyResolution(spaces, { selectFirst, serverConfirmed: false })
    .then((changed) => { if (!changed) return requestPush(); });
  if (!automaticSyncActive()) manualResolution = work;
  return work.catch(() => { manualResolution = null; setStatus("error"); });
}

export type Reconciliation =
  | { kind: "conflict" } // guest↔account sign-in (no shared history) → coarse prompt
  | { kind: "item-conflict"; spaces: SavedSpace[]; conflicts: Conflict[] } // 3-way per-item
  | { kind: "apply"; spaces: SavedSpace[] }
  // First sign-in uploading more tabs than the plan syncs (TASK-33): say so
  // before the upload instead of letting the first push end in "Sync paused".
  | { kind: "over-cap"; spaces: SavedSpace[]; tabs: number; cap: number };

/**
 * Guest / no-merge-base reconciliation only (FE-C3).
 * - explicit login + BOTH sides have real tabs → conflict (SyncConflictModal)
 * - after a "keep tabs" sign-out + local tabs → conflict too, on any reconcile
 *   without a base and even into an empty account: those tabs came from an
 *   earlier sign-in (TASK-11)
 * - explicit login + local only + more tabs than the plan's cap → over-cap
 *   notice first (TASK-33); `cap` undefined (unknown) or 0 (unlimited) skips it
 * - server only → take server; local only → keep local; both → mergeSpacesGuest
 * Live OCC with a base uses decideReconciliation3 → merge3.
 */
export function decideReconciliation(server: SavedSpace[], local: SavedSpace[], freshLogin: boolean, askBeforeUpload = false, cap?: number): Reconciliation {
  const serverReal = hasRealData(server);
  const localReal = hasRealData(local);

  if (localReal && ((freshLogin && serverReal) || askBeforeUpload)) return { kind: "conflict" };

  if (freshLogin && localReal && !serverReal && cap !== undefined && cap > 0) {
    const tabs = totalTabs(local);
    if (tabs > cap) return { kind: "over-cap", spaces: local, tabs, cap };
  }

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
  askBeforeUpload = false,
  cap?: number,
): Reconciliation {
  if (!base) return decideReconciliation(server, local, freshLogin, askBeforeUpload, cap);
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
 *
 * Resolves to whether the local document was rewritten.
 */
async function applyResolution(
  spaces: SavedSpace[],
  opts: { selectFirst?: boolean; serverConfirmed?: boolean; manual?: boolean } = {},
) {
  const { selectFirst = false, serverConfirmed = false } = opts;
  // Only rewrite the doc when the data actually changed; otherwise the rewrite
  // would persist → push → broadcast → re-pull → push, looping forever.
  const changed = spacesSignature(spaces) !== spacesSignature(getSpaces());
  if (changed) setSpaces(spaces);
  // After login, jump to the first space/group; otherwise keep a valid selection.
  if (selectFirst || changed) syncActiveSelection(selectFirst);
  if (!opts.manual) markHydrated(); // enable the structured push → uploads when local still needs OCC
  if (serverConfirmed) {
    // setMergeBase updates its cache after storage completes. Compare against
    // that confirmed base, not the previous one captured before its write.
    await setMergeBase(spaces);
    markSynced();
    await recomputeDirty();
  } else {
    await recomputeDirty();
  }
  await clearConflictPending(); // resolver finished (or pull overwrite); not the same as push-clean
  if (!opts.manual) connectWebSocket(); // realtime change-notifier
  return changed;
}

/** Wait before the one retry of a plan load that failed (TASK-33). */
export const PLAN_RETRY_MS = 1000;
async function loadPlanWithRetry() {
  await usePlanStore.getState().load();
  if (usePlanStore.getState().status) return;
  await new Promise((resolve) => setTimeout(resolve, PLAN_RETRY_MS));
  await usePlanStore.getState().load();
}

function reconcile(freshLogin: boolean, manual = false, sameSession = captureSyncSession()) {
  const generation = engineGeneration;
  const allowed = () => sameSession() && (manual || (automaticSyncActive() && generation === engineGeneration));
  return manual ? reconcileState(freshLogin, true, allowed) : withSyncWriteLock(() => reconcileState(freshLogin, false, allowed));
}

async function reconcileState(freshLogin: boolean, manual: boolean, allowed: () => boolean): Promise<"ok" | "offline" | "conflict" | "paused"> {
  if (!allowed()) return "paused";
  let server: SavedSpace[];
  try {
    const data = await apiFetch<{ spaces: BeSpace[]; revision: number }>("/api/sync");
    if (!allowed()) return "paused";
    server = mapBeToLocal(data.spaces);
    await setStoredRevision(data.revision);
  } catch (_) {
    // Offline — can't reconcile. Keep local; don't upload (would risk a blind
    // overwrite). Connect so we retry when back online.
    if (!allowed()) return "paused";
    setStatus("offline");
    if (!manual) connectWebSocket();
    return "offline";
  }

  const base = await getMergeBase();
  const askBeforeUpload = await loadKeptOnSignOut();
  // The plan's cap decides whether a first upload needs a notice (TASK-33), so
  // it is known before deciding, not after the push is rejected.
  // load() never rejects. One retry covers a brief network blip; if the plan
  // still fails, the cap stays unknown and sync goes on as before (push →
  // "Sync paused"): the server enforces the cap, so this stays tolerant.
  if (freshLogin && !base) await loadPlanWithRetry();
  if (!allowed()) return "paused";
  const local = getSpaces();
  const decision = decideReconciliation3(base, server, local, freshLogin, askBeforeUpload, tabCap(usePlanStore.getState().status));

  if (decision.kind === "over-cap") {
    pendingLocal = decision.spaces;
    useOverCapNotice.getState().open(decision.tabs, decision.cap);
    setStatus("online");
    return "conflict"; // wait for acknowledgeOverCap()
  }

  if (decision.kind === "conflict") {
    pendingServer = server;
    pendingLocal = local;
    useSyncConflict.getState().open(server, local);
    setStatus("online");
    return "conflict"; // wait for resolveConflict()
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
    return "conflict"; // wait for resolveMergeConflicts()
  }

  // Only treat as server-confirmed when the applied tree is exactly the pull —
  // merged/local-only trees still need a confirmed PUT before merge-base moves.
  await applyResolution(decision.spaces, {
    manual,
    selectFirst: freshLogin,
    serverConfirmed: spacesSignature(decision.spaces) === spacesSignature(server),
  });
  if (freshLogin) await clearFreshLogin(); // acted on
  if (askBeforeUpload && !base) await clearKeptOnSignOut(); // nothing local to ask about
  return "ok";
}

/** The over-cap notice was read (TASK-33): continue the first upload as before.
 *  The server stays the judge of the cap, so the push is still sent; it is
 *  rejected and the lasting "Sync paused" state takes over, now expected. */
export function acknowledgeOverCap() {
  const l = pendingLocal;
  pendingLocal = null;
  useOverCapNotice.getState().close();
  if (!l) return;
  void clearFreshLogin();
  void applyUserResolution(l, true);
}

/** Resolve a guest↔account conflict with the user's choice. */
export function resolveConflict(choice: "merge" | "server" | "local") {
  const s = pendingServer, l = pendingLocal;
  pendingServer = pendingLocal = null;
  useSyncConflict.getState().close();
  if (!s || !l) return;
  void clearKeptOnSignOut(); // the kept tabs have their answer
  void clearFreshLogin();
  // Before the doc write that triggers the upload: the account's tree it replaces stays in history (TASK-67).
  void markResolutionPush();
  // Jump to first space/group after resolving; always needs push (not server-only GET).
  applyUserResolution(resolveChoice(choice, s, l), true);
}

/** Apply the user's per-item choices to a pending 3-way conflict. Re-runs merge3
 *  with the resolutions to produce the final tree, then enables upload; merge-base
 *  advances when the background push lands (FE-A1 / FE-B1). `keepBoth` lists
 *  tab-address conflicts (by key) where both versions stay (TASK-29): they are
 *  resolved to this device and the account's version is added after merge3. */
export function resolveMergeConflicts(resolutions: Resolutions, keepBoth: string[] = []) {
  const b = pendingMergeBase, s = pendingServer, l = pendingLocal, c = pendingMergeConflicts ?? [];
  pendingServer = pendingLocal = pendingMergeBase = pendingMergeConflicts = null;
  useMergeConflict.getState().close();
  if (!s || !l) return;
  const both = new Set(keepBoth);
  const { merged } = merge3(b, s, l, { ...resolutions, ...Object.fromEntries(keepBoth.map((k) => [k, "local" as const])) });
  // Before the doc write that triggers the upload: the account's tree it replaces stays in history (TASK-67).
  void markResolutionPush();
  applyUserResolution(addAccountCopies(merged, s, c.filter((x) => both.has(x.key))));
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
let wsLastAttemptAt = 0;
// The server answered over HTTP while the socket was waiting to retry: that
// retry runs at once, but only once until the socket opens again, so a server
// that serves HTTP yet refuses the socket can't add an attempt per request.
let wsServerRetryUsed = false;

/** The browser says there is no network: any handshake now would fail and be logged. */
function deviceOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function scheduleReconnect() {
  // Offline: wait for the browser's `online` event instead of failing on a timer.
  if (deviceOffline()) return;
  const jittered = Math.round(wsReconnectDelay * (0.8 + Math.random() * 0.4));
  wsReconnectTimer = setTimeout(connectWebSocket, jittered);
  wsReconnectDelay = Math.min(wsReconnectDelay * 2, WS_RECONNECT_MAX_MS);
}

function connectWebSocket() {
  if (ws || clientTooOld || !automaticSyncActive()) return;
  if (deviceOffline()) { setStatus("offline"); return; }
  // An attempt is starting now, from whichever path: a retry still waiting would
  // be a second, early attempt that breaks the backoff, so drop it.
  if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null; }
  const generation = engineGeneration;

  setStatus("connecting");
  Promise.all([loadTokens(), getDeviceId()]).then(([tokens, did]) => {
    if (ws || !automaticSyncActive() || generation !== engineGeneration) return;
    if (!tokens) { setStatus("offline"); return; }
    if (deviceOffline()) { setStatus("offline"); return; }

    // The token rides in the Sec-WebSocket-Protocol header (not the query
    // string, which lands in proxy/access logs). The server echoes back
    // "flextab.v1" to satisfy the browser's subprotocol negotiation.
    const wsUrl = API_BASE_URL.replace(/^http/, "ws") +
      "/api/ws?device_id=" + encodeURIComponent(did) + "&" + clientQuery();
    wsLastAttemptAt = Date.now();
    ws = new WebSocket(wsUrl, ["flextab.v1", "flextab.bearer." + tokens.access_token]);

    ws.onopen = () => {
      if (!automaticSyncActive() || generation !== engineGeneration) return;
      wsReconnectDelay = WS_RECONNECT_BASE_MS;
      wsServerRetryUsed = false;
      setStatus("online");
      // Reconcile on every (re)connect, not just the pre-hydration case: a device
      // that was offline while another device changed data would otherwise stay
      // stale until it happened to push. The 3-way merge makes this safe (a no-op
      // when converged). Skip while a conflict prompt is pending resolution.
      if (!pendingServer) void reconcile(false);
    };

    ws.onmessage = (event) => {
      if (!automaticSyncActive() || generation !== engineGeneration) return;
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "sync" && !pendingServer) {
          // Skip while a conflict prompt is awaiting the user's choice.
          if (msg.entity_type === "restore") {
            // Another device restored a version — the server is authoritative;
            // overwrite local so a merge can't resurrect the discarded tree.
            void pullAndOverwrite(true);
          } else if (msg.entity_type === "full") {
            // Another device changed data — re-pull and merge (no conflict prompt).
            void reconcile(false);
          }
        }
      } catch (_) { /* ignore parse errors */ }
    };

    ws.onclose = (event) => {
      ws = null;
      // Too old for the server (TASK-114): no reconnect; "Update needed" takes over.
      if (event?.code === CLIENT_TOO_OLD_CLOSE_CODE) {
        clientTooOld = true; // a retry already waiting finds this and stops
        void markClientTooOld(String(event.reason ?? "").split(" ")[1]);
        return;
      }
      if (automaticSyncActive() && generation === engineGeneration) {
        setStatus("offline");
        scheduleReconnect();
      }
    };

    ws.onerror = () => { ws?.close(); };
  }).catch(() => { if (automaticSyncActive()) setStatus("offline"); });
}

// Reconnect hints (TASK-63). Going offline drops the socket and the retry timer
// at once, so no attempt runs while there is nothing to reach; coming back
// online tries once, straight away, from a fresh backoff. While a retry is
// waiting, two more signals bring it forward without resetting the backoff:
// the server answering an HTTP request, and the user returning to the page.
// The listeners are removed when the engine stops, so they only run while it runs.
function onNetworkOffline() {
  disconnectWebSocket();
  if (automaticSyncActive()) setStatus("offline");
}
function onNetworkOnline() {
  if (!automaticSyncActive()) return;
  if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null; }
  wsReconnectDelay = WS_RECONNECT_BASE_MS;
  wsServerRetryUsed = false;
  connectWebSocket();
}
function retryWaitingSocketNow(): boolean {
  return engineRunning && automaticSyncActive() && !ws && wsReconnectTimer !== null && !deviceOffline();
}
function onServerAnswered() {
  if (!retryWaitingSocketNow() || wsServerRetryUsed) return;
  wsServerRetryUsed = true;
  connectWebSocket();
}
function onVisibilityChange() {
  if (typeof document === "undefined" || document.visibilityState !== "visible") return;
  if (!retryWaitingSocketNow() || Date.now() - wsLastAttemptAt < WS_VISIBLE_RETRY_GAP_MS) return;
  connectWebSocket();
}
let stopServerReachable: (() => void) | null = null;
function listenForReconnectHints(on: boolean) {
  const target = globalThis as { addEventListener?: typeof addEventListener; removeEventListener?: typeof removeEventListener };
  const method = on ? target.addEventListener : target.removeEventListener;
  method?.call(globalThis, "offline", onNetworkOffline);
  method?.call(globalThis, "online", onNetworkOnline);
  if (typeof document !== "undefined") {
    if (on) document.addEventListener("visibilitychange", onVisibilityChange);
    else document.removeEventListener("visibilitychange", onVisibilityChange);
  }
  stopServerReachable?.();
  stopServerReachable = on ? onServerReachable(onServerAnswered) : null;
}

function disconnectWebSocket() {
  if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null; }
  wsReconnectDelay = WS_RECONNECT_BASE_MS;
  wsServerRetryUsed = false;
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
  const sameSession = captureSyncSession();
  const generation = ++engineGeneration;
  engineRunning = true;
  clientTooOld = false;
  listenForReconnectHints(true);
  clearHydrated();
  // Wait for persisted settings before using the default-on UI state.
  if (!useSettingsStore.persist.hasHydrated()) {
    await new Promise<void>(resolve => {
      const unsub = useSettingsStore.persist.onFinishHydration(() => { unsub(); resolve(); });
    });
  }
  const active = () => sameSession() && automaticSyncActive() && generation === engineGeneration;
  if (!active()) return;

  setStatus("connecting");
  // Was this triggered by an explicit login (vs a returning-session restore)?
  let fresh = false;
  try {
    const f = await chrome.storage.local.get(FRESH_LOGIN_KEY);
    if (!active()) return;
    fresh = f[FRESH_LOGIN_KEY] === true; // cleared by reconcile once acted on
  } catch (_) { /* ok */ }

  // Background may have stashed a true OCC conflict while no newtab was open.
  if (!active()) return;
  if (await adoptStoredOccConflict()) {
    if (!active()) return;
    markHydrated();
    setStatus("online");
    connectWebSocket();
    return;
  }

  try { await applyPendingLandedSnapshot(); }
  catch (_) { if (active()) setStatus("error"); return; }
  if (!active()) return;
  if (await adoptStoredOccConflict()) {
    if (!active()) return;
    markHydrated();
    setStatus("online");
    connectWebSocket();
    return;
  }
  if (active()) await reconcile(fresh);
}

// Pauses the engine — called on every isAuthenticated/autoSync flip and on
// unmount, not just a real sign-out (a transient auth drop, e.g. a
// refresh-token race, goes through here too). The merge base must survive
// this: it's cleared explicitly in useAuthStore's logout() instead, so a
// spurious session drop + re-login doesn't invalidate the 3-way-merge
// ancestor and manufacture a conflict out of nothing.
export function stopSyncEngine() {
  manualResolution = null;
  engineRunning = false;
  ++engineGeneration;
  listenForReconnectHints(false);
  disconnectWebSocket();
  clearHydrated();
  // Torn down with a conflict still unresolved (e.g. auto-sync toggled off from
  // settings while the resolver was open, bypassing "Pause sync and decide later") → persist
  // the conflict flag so it isn't silently dropped. The dismiss path already set
  // it and nulled pendingMergeConflicts before this runs, so it's not double-set.
  if (pendingMergeConflicts) setConflictPending(true);
  pendingServer = pendingLocal = pendingMergeBase = pendingMergeConflicts = null;
  useSyncConflict.getState().close();
  useMergeConflict.getState().close();
  setStatus("paused");
}

export type ManualSyncResult =
  | { status: "ok" | "offline" | "conflict" | "error" | "signed_out" }
  | { status: "limit"; message: string };

let manualFlight: Promise<ManualSyncResult> | null = null;

/** One explicit pull/reconcile/upload. Never enables background or WS sync. */
export function syncNow(): Promise<ManualSyncResult> {
  if (manualFlight) return manualFlight;
  const authorized = captureSyncSession();
  manualFlight = withSyncWriteLock(async (): Promise<ManualSyncResult> => {
    if (!authorized()) return { status: "signed_out" };
    setStatus("syncing");
    try {
      if (manualResolution) await manualResolution;
      if (!authorized()) return { status: "signed_out" };
      await applyPendingLandedSnapshot();
      if (!authorized()) return { status: "signed_out" };
      if (await adoptStoredOccConflict()) { manualResolution = null; return { status: "conflict" }; }
      if (!authorized()) return { status: "signed_out" };
      const flags = await chrome.storage.local.get(FRESH_LOGIN_KEY);
      if (!authorized()) return { status: "signed_out" };
      const fresh = flags[FRESH_LOGIN_KEY] === true; // cleared by reconcile once acted on
      const result = manualResolution ? "ok" : await reconcile(fresh, true, authorized);
      if (result !== "ok") return { status: result === "paused" ? "signed_out" : result };
      if (!authorized()) return { status: "signed_out" };
      await persistState();
      if (!authorized()) return { status: "signed_out" };
      // A server-only pull already completed the operation. Local edits need an
      // acknowledged PUT; scheduling a worker upload is not a successful sync.
      const base = await getMergeBase();
      if (!authorized()) return { status: "signed_out" };
      if (!manualResolution && spacesSignature(getSpaces()) === spacesSignature(base ?? [])) return { status: "ok" };
      let limitMessage = "Sync limit reached";
      const pushed = await syncStructuredSnapshot(
        getSpaces(),
        async () => getSpaces(),
        async (server, local) => {
          const base = await getMergeBase();
          const { merged, conflicts } = merge3(base, server as SavedSpace[], local as SavedSpace[]);
          if (conflicts.length) {
            await saveOccConflictPayload({ base, server: server as SavedSpace[], local: local as SavedSpace[], conflicts }, true);
            return null;
          }
          return merged;
        },
        async (spaces, _revision, local) => {
          if (!authorized()) throw new Error("Session changed during sync");
          await recordLandedSnapshot(spaces as SavedSpace[], local as SavedSpace[]);
          await applyPendingLandedSnapshot();
        },
        async (message, detail) => { limitMessage = message; await saveLimitNotice(message, detail); },
        async () => authorized(),
      );
      if (pushed === "ok") await clearLimitNotice();
      if (!authorized()) return { status: "signed_out" };
      if (await adoptStoredOccConflict()) { manualResolution = null; return { status: "conflict" }; }
      if (!authorized()) return { status: "signed_out" };
      await recomputeDirty();
      if (!authorized()) return { status: "signed_out" };
      if (pushed === "ok") { manualResolution = null; markSynced(); return { status: "ok" }; }
      if (pushed === "limit") return { status: "limit", message: limitMessage };
      if (pushed === "paused") return { status: "signed_out" };
      return { status: "error" };
    } catch {
      return { status: "error" };
    }
  }).then(result => {
    if (!authorized()) return { status: "signed_out" } as ManualSyncResult;
    if (!automaticSyncActive()) setStatus("paused");
    else if (result.status === "error" || result.status === "limit") setStatus("error");
    else if (result.status === "offline") setStatus("offline");
    else setStatus("online");
    return result;
  }).finally(() => { manualFlight = null; });
  return manualFlight;
}

/** Force-pull the server state and overwrite local — used after a snapshot
 *  restore, where the server is authoritative and a merge would undo the restore. */
export function pullAndOverwrite(automatic = false): Promise<boolean> {
  const generation = engineGeneration;
  const sameSession = captureSyncSession();
  const allowed = () => sameSession() && (!automatic || (automaticSyncActive() && generation === engineGeneration));
  return withSyncWriteLock(() => overwriteFromServer(allowed));
}

async function overwriteFromServer(allowed: () => boolean): Promise<boolean> {
  if (!allowed()) return false;
  setStatus("syncing");
  try {
    const data = await apiFetch<{ spaces: BeSpace[]; revision: number }>("/api/sync");
    if (!allowed()) return false;
    await setStoredRevision(data.revision);
    if (!allowed()) return false;
    // Restore/overwrite: GET is authoritative — merge-base may advance immediately.
    await applyResolution(mapBeToLocal(data.spaces), { selectFirst: true, serverConfirmed: true });
    return allowed();
  } catch (_) {
    if (!allowed()) return false;
    setStatus("offline");
    connectWebSocket();
    return false;
  } finally {
    if (allowed() && !automaticSyncActive()) setStatus("paused");
  }
}

useSettingsStore.subscribe((state, previous) => {
  if (!state.autoSync && previous.autoSync) stopSyncEngine();
});

useAuthStore.subscribe((state, previous) => {
  if (state.isAuthenticated !== previous.isAuthenticated || state.user?.id !== previous.user?.id) {
    ++authGeneration;
    manualResolution = null;
  }
});
