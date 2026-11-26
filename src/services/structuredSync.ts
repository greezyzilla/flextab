import { pushSync, fetchSyncRevision } from "./api";
import { getStoredRevision, setStoredRevision } from "./revision";
import type { SyncLimitDetail } from "./syncLimit";
import { canonicalSpaces } from "~src/lib/canonicalSpaces";
import type { SavedSpace } from "~src/types";

// Every tree on the wire is canonical (display order, `order` = position, ids
// once): the server stores positions, so this keeps what lands equal to what
// the merge base records. See lib/canonicalSpaces.
const canon = (spaces: unknown[]) => canonicalSpaces(spaces as SavedSpace[]) as unknown[];

const MAX_ATTEMPTS = 4;

export type StructuredSyncResult = "ok" | "skipped" | "error" | "limit" | "paused";

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
  onPushed?: (spaces: unknown[], revision: number, localAtAttempt: unknown[]) => void | Promise<void>,
  onLimit?: (message: string, detail: SyncLimitDetail) => void | Promise<void>,
  canPush?: () => Promise<boolean>,
): Promise<StructuredSyncResult> {
  let spaces = canon(initialSpaces);
  let localAtAttempt = spaces;
  let base = await getStoredRevision();
  if (base === null) {
    // An empty workspace needs a revision from reconciliation/earlier sync.
    // Fetching only a fresh revision would authorize a blind full deletion.
    if (spaces.length === 0) return "error";
    base = await fetchSyncRevision();
    if (base === null) return "error"; // offline / not ready — retry on next change
    await setStoredRevision(base);
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (canPush && !await canPush()) return "paused";
    const result = canPush ? await pushSync(spaces, base, canPush) : await pushSync(spaces, base);
    if (result.status === "paused") return "paused";
    if (result.status === "ok") {
      // Persist the acknowledgement before advancing the revision. If receipt
      // storage fails, the next attempt must still get a 409 and recover peers.
      await onPushed?.(spaces, result.revision, localAtAttempt);
      await setStoredRevision(result.revision);
      return "ok";
    }
    if (result.status === "conflict") {
      base = result.revision;
      const local = canon(await reReadSpaces());
      const merged = mergeOnConflict ? await mergeOnConflict(canon(result.spaces), local) : local;
      if (merged === null) {
        // The caller durably saved the conflict before returning null.
        await setStoredRevision(base);
        return "skipped";
      }
      localAtAttempt = local;
      spaces = canon(merged);
      continue;
    }
    if (result.status === "limit") {
      // A plan or payload-size limit prevented this write from being accepted.
      // Surface it (the caller notifies the UI) and stop; retrying won't help until
      // the user prunes or their limit is raised.
      await onLimit?.(result.message, { limit: result.limit, cap: result.cap, got: result.got });
      return "limit";
    }
    return "error";
  }
  return "error"; // retries exhausted under sustained contention
}
