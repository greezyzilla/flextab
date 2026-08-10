import type { StateStorage } from 'zustand/middleware';

/**
 * Dual-storage adapter for **Zustand UI state only** (selection, settings).
 *
 * Spaces / tab tree data is NOT stored here — Yjs owns that via
 * `flextab_yjs_state` + structured server sync (FE-C2). Do not assume
 * chrome.storage.sync is how tabs move across devices.
 *
 * Local storage: fast, ~10MB limit, single device
 * Sync storage: cross-device, 100KB total, 8KB/item → requires chunking
 *
 * Write flow: local (immediate) → sync (debounced, chunked, best-effort)
 * Read flow:  local first → fallback to sync (new device bootstrap)
 */

const CHUNK_SIZE = 7500; // Under 8KB per-item limit, leaving room for key overhead
const SYNC_DEBOUNCE_MS = 2000; // Debounce sync writes to respect rate limits (120/min)

let _rehydrating = false;
let _syncTimeout: ReturnType<typeof setTimeout> | null = null;

// --- Chunked sync storage ---

async function writeChunkedSync(name: string, value: string): Promise<void> {
  const totalChunks = Math.ceil(value.length / CHUNK_SIZE);

  const data: Record<string, unknown> = {};
  data[`${name}__meta`] = { chunks: totalChunks, ts: Date.now() };
  for (let i = 0; i < totalChunks; i++) {
    data[`${name}__${i}`] = value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
  }

  // Remove stale chunks from previous (possibly larger) writes
  const existing = await chrome.storage.sync.get(null);
  const staleKeys = Object.keys(existing).filter(
    (k) => k.startsWith(`${name}__`) && !(k in data),
  );
  if (staleKeys.length > 0) {
    await chrome.storage.sync.remove(staleKeys);
  }

  await chrome.storage.sync.set(data);
}

async function readChunkedSync(name: string): Promise<string | null> {
  const metaKey = `${name}__meta`;
  const metaResult = await chrome.storage.sync.get(metaKey);
  const meta = metaResult[metaKey] as { chunks: number; ts: number } | undefined;
  if (!meta) return null;

  const chunkKeys = Array.from({ length: meta.chunks }, (_, i) => `${name}__${i}`);
  const chunkData = await chrome.storage.sync.get(chunkKeys);

  let result = '';
  for (let i = 0; i < meta.chunks; i++) {
    const chunk = chunkData[`${name}__${i}`];
    if (chunk === undefined) return null; // corrupted/incomplete
    result += chunk;
  }

  return result;
}

async function removeChunkedSync(name: string): Promise<void> {
  const all = await chrome.storage.sync.get(null);
  const keys = Object.keys(all).filter((k) => k.startsWith(`${name}__`));
  if (keys.length > 0) {
    await chrome.storage.sync.remove(keys);
  }
}

// --- Debounced sync write ---

function debouncedSyncWrite(name: string, value: string) {
  if (_syncTimeout) clearTimeout(_syncTimeout);
  _syncTimeout = setTimeout(async () => {
    try {
      await writeChunkedSync(name, value);
    } catch (error) {
      // Quota exceeded or rate limited — sync is best-effort
      console.warn('[FlexTab] Sync write failed:', error);
    }
  }, SYNC_DEBOUNCE_MS);
}

// --- State timestamp injection ---
// Zustand persist stores data as { state: {...}, version: N }
// We inject lastModified into state for conflict resolution

function injectTimestamp(value: string): string {
  try {
    const parsed = JSON.parse(value);
    if (parsed.state) {
      parsed.state.lastModified = Date.now();
    }
    return JSON.stringify(parsed);
  } catch (_) {
    return value;
  }
}

function extractTimestamp(value: string): number {
  try {
    const parsed = JSON.parse(value);
    return parsed.state?.lastModified ?? 0;
  } catch (_) {
    return 0;
  }
}

// --- Main storage adapter ---

export const storage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      const result = await chrome.storage.local.get(name);
      const localValue = result[name] ?? null;

      if (localValue) return localValue;

      // New device bootstrap: pull from sync storage
      const syncValue = await readChunkedSync(name);
      if (syncValue) {
        await chrome.storage.local.set({ [name]: syncValue });
        return syncValue;
      }

      return null;
    } catch (error) {
      console.error('[FlexTab] Storage read error:', error);
      return null;
    }
  },

  setItem: async (name: string, value: string): Promise<void> => {
    try {
      const timestamped = injectTimestamp(value);
      await chrome.storage.local.set({ [name]: timestamped });

      if (!_rehydrating) {
        debouncedSyncWrite(name, timestamped);
      }
    } catch (error) {
      console.error('[FlexTab] Storage write error:', error);
    }
  },

  removeItem: async (name: string): Promise<void> => {
    try {
      await chrome.storage.local.remove(name);
      await removeChunkedSync(name).catch(() => {});
    } catch (error) {
      console.error('[FlexTab] Storage remove error:', error);
    }
  },
};

// --- Cross-tab & cross-device sync listener (QUARANTINED — FE-C2) ---
//
// Not wired from any production entry (newtab/popup/background). Spaces
// multi-tab uses Yjs PERSIST_KEY + installExternalPersistBridge; account
// data uses structured API OCC. Kept for unit coverage and in case a
// non-spaces store wants chrome.sync rehydrate later — do not call for
// savedSpaces; it would fight Yjs authority.

/**
 * @deprecated Unwired in app. Quarantined (FE-C2): not the spaces sync path.
 * Prefer Yjs external persist bridge / settings pull for live multi-context.
 */
export function setupStorageSync(
  storeName: string,
  rehydrate: () => Promise<void>,
) {
  if (!chrome.storage?.onChanged) return;

  chrome.storage.onChanged.addListener(async (changes, areaName) => {
    if (_rehydrating) return;

    // Cross-tab sync: another tab on the same device wrote to local
    if (areaName === 'local' && changes[storeName]) {
      _rehydrating = true;
      try {
        await rehydrate();
      } finally {
        _rehydrating = false;
      }
      return;
    }

    // Cross-device sync: another device wrote to sync storage
    if (
      areaName === 'sync' &&
      Object.keys(changes).some((k) => k.startsWith(`${storeName}__`))
    ) {
      const syncValue = await readChunkedSync(storeName);
      if (!syncValue) return;

      // Conflict resolution: last-write-wins by timestamp
      const localResult = await chrome.storage.local.get(storeName);
      const localValue = localResult[storeName];

      if (localValue) {
        const localTime = extractTimestamp(localValue);
        const syncTime = extractTimestamp(syncValue);
        if (syncTime <= localTime) return; // local is newer, keep it
      }

      // Sync is newer — apply it
      _rehydrating = true;
      try {
        await chrome.storage.local.set({ [storeName]: syncValue });
        await rehydrate();
      } finally {
        _rehydrating = false;
      }
    }
  });
}
