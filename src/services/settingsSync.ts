import { useSettingsStore } from "~src/store/useSettingsStore";
import { useAuthStore } from "~src/store/useAuthStore";
import { apiGetSettings, apiPutSettings } from "./api";
import { withSyncWriteLock } from "./syncPolicy";

// The settings that belong to the account (synced via the BE), not device-only.
function snapshot() {
  const s = useSettingsStore.getState();
  return {
    groupLayout: s.groupLayout,
    gridColumns: s.gridColumns,
    density: s.density,
    hue: s.hue,
    intensity: s.intensity,
    autoSync: s.autoSync,
  };
}
type Snap = ReturnType<typeof snapshot>;

const KEYS = Object.keys(snapshot()) as (keyof Snap)[];
const RETRY_MS = 5000;

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let unsub: (() => void) | null = null;
// The last snapshot we know matches the server — the 3-way base for field-level
// merges. `lastPushed` short-circuits the change subscription (incl. our own
// writes when adopting remote fields).
let base: Snap | null = null;
let lastPushed = "";
let generation = 0;

// Capture before any timer, lock or I/O. A later login (even the same account)
// must not authorize work that was started by an earlier session.
function captureSession(): () => boolean {
  const auth = useAuthStore.getState();
  const signedIn = auth.isAuthenticated && Boolean(auth.user?.id);
  const started = generation;
  return () => signedIn && started === generation;
}

const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Field-level 3-way: a field the local device changed since `base` wins; any
 *  field it didn't touch adopts the server's value (another device may have set
 *  it). Prevents a reconnecting device from clobbering another device's change. */
export function fieldMerge(baseSnap: Snap | null, remote: Partial<Snap>, local: Snap): Snap {
  const out = { ...local } as Snap;
  for (const k of KEYS) {
    const changedLocally = !baseSnap || !eq(local[k], baseSnap[k]);
    if (!changedLocally && remote[k] !== undefined) (out as Record<string, unknown>)[k] = remote[k];
  }
  return out;
}

function applyLocally(snap: Snap) {
  useSettingsStore.setState(snap as Partial<ReturnType<typeof useSettingsStore.getState>>);
}

function scheduleRetry(allowed: () => boolean) {
  if (!allowed() || retryTimer || !unsub) return;
  retryTimer = setTimeout(() => { retryTimer = null; void pushNow(allowed); }, RETRY_MS);
}

/** Pull-merge the account settings, then push the reconciled result. Idempotent;
 *  used for the debounced change push, the failure retry, and reconnect catch-up. */
async function pushNow(allowed: () => boolean): Promise<void> {
  if (!allowed()) return;
  try {
    // Share the login/logout lock so credential changes cannot race the GET/PUT
    // sequence. Guards also handle auth changes observed outside that lock.
    await withSyncWriteLock(async () => {
      if (!allowed()) return;
      const local = snapshot();
      const remote = await apiGetSettings();
      if (!allowed()) return;
      const merged = remote && Object.keys(remote).length ? fieldMerge(base, remote as Partial<Snap>, local) : local;
      await apiPutSettings(merged);
      if (!allowed()) return;
      base = merged;
      lastPushed = JSON.stringify(merged);
      if (!eq(merged, local)) applyLocally(merged); // adopt fields another device changed
    });
  } catch {
    scheduleRetry(allowed); // never retry an old session's failed request
  }
}

/** Pull account settings and apply them locally. Call after sign-in / on startup. */
export async function pullSettings(): Promise<void> {
  const allowed = captureSession();
  if (!allowed()) return;
  try {
    await withSyncWriteLock(async () => {
      if (!allowed()) return;
      const remote = await apiGetSettings();
      if (!allowed()) return;
      if (!remote || Object.keys(remote).length === 0) {
        // Account has none yet — seed it from this device's settings.
        const snap = snapshot();
        await apiPutSettings(snap);
        if (!allowed()) return;
        base = snap;
        lastPushed = JSON.stringify(snap);
        return;
      }
      const patch: Partial<Snap> = {};
      for (const k of KEYS) {
        if (remote[k] !== undefined) (patch as Record<string, unknown>)[k] = remote[k];
      }
      const merged = { ...snapshot(), ...patch };
      base = merged;
      lastPushed = JSON.stringify(merged);
      if (Object.keys(patch).length) applyLocally(merged);
    });
  } catch {
    // offline / unauthorized — settings stay local; a later change will push-merge.
  }
}

/** Push local settings to the account (debounced) whenever they change while signed in. */
export function startSettingsSync(): void {
  if (unsub) return;
  const allowed = captureSession();
  if (!allowed()) return;
  unsub = useSettingsStore.subscribe(() => {
    if (!allowed()) return;
    const snap = JSON.stringify(snapshot());
    if (snap === lastPushed) return;
    lastPushed = snap; // optimistic; pushNow re-reads and reconciles
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => { pushTimer = null; void pushNow(allowed); }, 800);
  });
}

export function stopSettingsSync(): void {
  generation++;
  base = null;
  lastPushed = "";
  if (unsub) { unsub(); unsub = null; }
  if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
}

useAuthStore.subscribe((state, previous) => {
  if (state.isAuthenticated !== previous.isAuthenticated || state.user?.id !== previous.user?.id) {
    stopSettingsSync();
  }
});
