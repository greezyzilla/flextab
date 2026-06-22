import { pushSync, fetchSyncRevision } from "./api";
import { getStoredRevision, setStoredRevision } from "./revision";

const MAX_ATTEMPTS = 4;

export type StructuredSyncResult = "ok" | "skipped" | "error";

/**
 * Push the structured snapshot to the server with optimistic concurrency.
 *
 * The Yjs doc is the source of truth; this keeps the queryable SQL projection in
 * step without silently overwriting another device's data:
 *  - seed base_revision (fetch the server's current one if unknown) — never push
 *    unconditionally,
 *  - on a 409 conflict, adopt the server revision, re-derive the snapshot from
 *    the (CRDT-merged) Yjs doc via reReadSpaces, and retry (bounded).
 *
 * reReadSpaces returns the latest snapshot derived from local Yjs state.
 */
export async function syncStructuredSnapshot(
  initialSpaces: unknown[],
  reReadSpaces: () => Promise<unknown[]>,
): Promise<StructuredSyncResult> {
  if (initialSpaces.length === 0) return "skipped";

  let spaces = initialSpaces;
  let base = await getStoredRevision();
  if (base === null) {
    base = await fetchSyncRevision();
    if (base === null) return "error"; // offline / not ready — retry on next change
    await setStoredRevision(base);
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const result = await pushSync(spaces, base);
    if (result.status === "ok") {
      await setStoredRevision(result.revision);
      return "ok";
    }
    if (result.status === "conflict") {
      base = result.revision;
      await setStoredRevision(base);
      spaces = await reReadSpaces();
      if (spaces.length === 0) return "skipped";
      continue;
    }
    return "error";
  }
  return "error"; // retries exhausted under sustained contention
}
