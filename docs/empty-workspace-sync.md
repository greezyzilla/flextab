# Empty workspace persistence and sync

An empty workspace is a valid data state. Import, restore, a remote deletion, or a store mutation can produce it. The sidebar's existing restriction on deleting the final space is unchanged.

- Hydration seeds and persists the default hierarchy only when the workspace key is absent and no merge-base, revision, or landed receipt remains. A stored empty Yjs document (legacy bytes or either version-1 envelope origin) stays empty across reloads.
- Storage read failures, invalid envelopes/updates, and missing data with surviving sync history fail hydration. The new-tab page and popup show a recovery message and a reload action; editing and page sync do not start. Failed hydration remains retryable and does not replace workspace storage with defaults.
- The worker requires a successfully decoded persisted document and the existing automatic-sync hydration gate. A missing key is an error, never shorthand for an empty workspace. Pending work remains available for retry.
- An empty upload requires a stored revision from prior sync/reconciliation. It cannot fetch only a current revision and blindly delete the account tree. OCC conflicts still use the common ancestor and the latest local state; an empty merge is uploaded, while delete-versus-edit conflicts await resolution.
- Reconciliation and authoritative restore preserve empty results. Acknowledgements advance the merge-base and revision to the accepted empty state, preserving any edits made during the request. Manual sync can upload empty data with auto-sync off without enabling automatic uploads.

Regression coverage includes real Yjs persistence/reload, first install, invalid storage, missing data with history, worker debounce/startup/retry, manual sync, restore, and a simulated two-device OCC backend. It does not replace a loaded Chrome extension check with two pages and an actual service-worker restart. No backend schema change is required.

Recovery is intentionally conservative: repeated load failures require investigation of the saved data. Reload retries transient failures; it does not repair corrupt bytes or automatically choose cloud data over potentially unsynced local work. Keep the extension installed and preserve its storage for recovery. Existing accounts whose empty state was already replaced by an older release need their intended state restored explicitly.
