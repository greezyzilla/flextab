import { useSettingsStore } from "~src/store/useSettingsStore";
import { useAuthStore } from "~src/store/useAuthStore";
import { apiGetSettings, apiPutSettings } from "./api";

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

const KEYS = Object.keys(snapshot()) as (keyof ReturnType<typeof snapshot>)[];

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let lastPushed = "";
let unsub: (() => void) | null = null;

/** Pull account settings and apply them locally. Call after sign-in / on startup. */
export async function pullSettings(): Promise<void> {
  if (!useAuthStore.getState().isAuthenticated) return;
  try {
    const remote = await apiGetSettings();
    if (!remote || Object.keys(remote).length === 0) {
      // Account has none yet — seed it from this device's settings.
      const snap = snapshot();
      lastPushed = JSON.stringify(snap);
      await apiPutSettings(snap);
      return;
    }
    const patch: Partial<ReturnType<typeof snapshot>> = {};
    for (const k of KEYS) {
      if (remote[k] !== undefined) (patch as Record<string, unknown>)[k] = remote[k];
    }
    if (Object.keys(patch).length) {
      lastPushed = JSON.stringify({ ...snapshot(), ...patch });
      useSettingsStore.setState(patch as Partial<ReturnType<typeof useSettingsStore.getState>>);
    }
  } catch {
    // offline / unauthorized — settings stay local
  }
}

/** Push local settings to the account (debounced) whenever they change while signed in. */
export function startSettingsSync(): void {
  if (unsub) return;
  unsub = useSettingsStore.subscribe(() => {
    if (!useAuthStore.getState().isAuthenticated) return;
    const snap = JSON.stringify(snapshot());
    if (snap === lastPushed) return;
    lastPushed = snap;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      apiPutSettings(snapshot()).catch(() => {});
    }, 800);
  });
}

export function stopSettingsSync(): void {
  if (unsub) { unsub(); unsub = null; }
  if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
}
