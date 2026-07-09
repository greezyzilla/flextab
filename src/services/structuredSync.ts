import { pushSync, fetchSyncRevision } from "./api";
import { getStoredRevision, setStoredRevision } from "./revision";

const MAX_ATTEMPTS = 4;

export type StructuredSyncResult = "ok" | "skipped" | "error" | "limit";

/**
 * Push the structured snapshot to the server with optimistic concurrency, never
 * silently overwriting another device's data:
 *  - seed base_revision (fetch the server's current one if unknown) — never push
 *    unconditionally,
 *  - on a 409 conflict, adopt the server revision and **merge the server's
 *    current state** (returned in the 409) with our latest local snapshot, then
 *    retry (bounded). Merging the conflict payload is what prevents a lost
 *    update — re-pushing our stale snapshot alone would clobber the other change.
 *
 * `reReadSpaces` returns the latest local snapshot. `mergeOnConflict` reconciles
 * the server's 409 state with it — a 3-way merge against the sync merge-base, so a
 * concurrent delete isn't resurrected. It may return `null` to signal a *true*
 * conflict (edit-edit / delete-vs-edit) that needs interactive resolution: the push
 * then backs off ("skipped") and the open new-tab reconcile surfaces the resolver.
 * `onPushed` fires once a push is confirmed (advances the merge-base to what landed).
 */
export async function syncStructuredSnapshot(
  initialSpaces: unknown[],
  reReadSpaces: () => Promise<unknown[]>,
  mergeOnConflict?: (server: unknown[], local: unknown[]) => unknown[] | null | Promise<unknown[] | null>,
  onPushed?: (spaces: unknown[], revision: number) => void | Promise<void>,
  onLimit?: (message: string) => void | Promise<void>,
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
      await onPushed?.(spaces, result.revision);
      return "ok";
    }
    if (result.status === "conflict") {
      base = result.revision;
      await setStoredRevision(base);
      const local = await reReadSpaces();
      const merged = mergeOnConflict ? await mergeOnConflict(result.spaces, local) : local;
      if (merged === null) return "skipped"; // true conflict — defer to interactive resolve
      spaces = merged;
      if (spaces.length === 0) return "skipped";
      continue;
    }
    if (result.status === "limit") {
      // The account is over its plan limit — the server rejected the whole write.
      // Surface it (the caller notifies the UI) and stop; retrying won't help until
      // the user prunes or their limit is raised.
      await onLimit?.(result.message);
      return "limit";
    }
    return "error";
  }
  return "error"; // retries exhausted under sustained contention
}
