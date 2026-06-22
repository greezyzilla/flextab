// Tracks the server's sync revision so structured pushes can use optimistic
// concurrency (base_revision). Persisted to chrome.storage so the background
// worker and the new-tab page share one value.
const REVISION_KEY = "flextab_sync_revision";

let cached: number | null = null;

export async function getStoredRevision(): Promise<number | null> {
  if (cached !== null) return cached;
  try {
    const result = await chrome.storage.local.get(REVISION_KEY);
    if (typeof result[REVISION_KEY] === "number") {
      cached = result[REVISION_KEY];
      return cached;
    }
  } catch (_) { /* no extension context */ }
  return null;
}

export async function setStoredRevision(revision: number): Promise<void> {
  cached = revision;
  try { await chrome.storage.local.set({ [REVISION_KEY]: revision }); } catch (_) { /* ok */ }
}

// Keep the in-memory cache in sync when another context updates the revision.
if (chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[REVISION_KEY] && typeof changes[REVISION_KEY].newValue === "number") {
      cached = changes[REVISION_KEY].newValue;
    }
  });
}
