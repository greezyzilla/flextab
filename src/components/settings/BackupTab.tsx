import { useRef, useState, useEffect, useMemo, type ChangeEvent } from "react";
import { useAuthStore } from "~src/store/useAuthStore";
import { formatRelativeTime } from "~src/store/useSyncStore";
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore";
import { apiListSnapshots, apiGetSnapshot, apiRestoreSnapshot, type SnapshotInfo } from "~src/services/snapshots";
import { pullAndOverwrite } from "~src/services/syncEngine";
import { parseImport, type ParsedImport } from "~src/services/importFormats";
import type { SavedSpace } from "~src/types";
import * as yjs from "~src/lib/yjsDoc";
import { ConfirmDialog } from "~src/components/ui/confirm-dialog";
import { Modal, ModalFooter, ModalHeader, ModalLink } from "~src/components/ui/modal";
import { exportWorkspace } from "~src/services/exportWorkspace";
import { ImportDialog } from "./ImportDialog";
import { SourceColumn } from "~src/components/WorkspaceTree";
import { Button } from "~src/components/ui/button";
import { SettingRow, GroupHeading, formatDate, formatBytes } from "./shared";
import { HistoryIcon, DataIcon } from "./icons";

// Backup groups the two "save & restore your workspace" surfaces: automatic
// version history and manual export/import. (History needs sign-in; export/
// import works locally too — each section handles its own auth state.)
export function BackupTab() {
  // Recovery state belongs to the account whose snapshot was selected.
  const historyAccount = useAuthStore(s => s.isAuthenticated ? s.user?.id ?? "authenticated" : "signed-out");
  return (
    <div className="flex flex-col gap-9">
      {/* Export/Import first: short & fixed. Version history last: it grows
          unboundedly, so keep it at the bottom instead of pushing everything
          else down. */}
      <DataTab />
      <HistoryTab key={historyAccount} />
    </div>
  );
}
function DataTab() {
  const { savedSpaces } = useSavedSpacesStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [pendingImport, setPendingImport] = useState<{ parsed: ParsedImport; fileName: string } | null>(null);

  const totalTabs = savedSpaces.reduce((sum, s) =>
    sum + s.projects.reduce((pSum, p) =>
      pSum + p.categories.reduce((cSum, c) =>
        cSum + c.groups.reduce((gSum, g) => gSum + g.tabs.length, 0), 0), 0), 0);

  const dataSize = new Blob([JSON.stringify(savedSpaces)]).size;
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleExport = () => {
    const data = JSON.stringify(savedSpaces, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `flextab-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportStatus(null);
    setPendingImport(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        // Validated and previewed first: nothing is written until the user applies.
        setPendingImport({ parsed: parseImport(ev.target?.result as string), fileName: file.name });
      } catch (err) {
        setImportStatus({ type: 'error', message: err instanceof Error ? err.message : 'Failed to import' });
      }
    };
    reader.onerror = () => {
      setImportStatus({ type: 'error', message: 'Could not read this file. Please try again.' });
    };
    reader.readAsText(file);
    // Reset so the same file can be re-imported
    e.target.value = '';
  };

  return (
    <div className="flex flex-col gap-7">
      <ImportDialog
        parsed={pendingImport?.parsed ?? null}
        fileName={pendingImport?.fileName ?? ""}
        onClose={() => setPendingImport(null)}
        onDone={(message) => setImportStatus({ type: 'success', message })}
      />
      <SettingRow label="Export" description="Download all your data as a JSON file.">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" size="sm" onClick={handleExport}>Export JSON</Button>
          <span className="text-fg-subtle text-xs font-sans">
            {savedSpaces.length} space{savedSpaces.length !== 1 ? 's' : ''} · {totalTabs} tab{totalTabs !== 1 ? 's' : ''} · {formatSize(dataSize)}
          </span>
        </div>
      </SettingRow>

      <SettingRow label="Import" description="Add tabs from a FlexTab backup (.json), a bookmarks export from any browser (.html), or a OneTab export (.txt). You see what's inside before anything changes.">
        <div className="flex flex-col gap-2">
          <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()} className="self-start">Import…</Button>
          <input ref={fileInputRef} type="file" accept=".json,.html,.htm,.txt" onChange={handleImport} className="hidden" />
          {importStatus && (
            <div role="status" className={`text-xs font-sans ${importStatus.type === 'success' ? 'text-success' : 'text-danger'}`}>
              {importStatus.message}
            </div>
          )}
        </div>
      </SettingRow>
    </div>
  );
}

// --- Sync Tab ---

function HistoryTab() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const [snapshots, setSnapshots] = useState<SnapshotInfo[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [previewing, setPreviewing] = useState<number | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [done, setDone] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [pendingPull, setPendingPull] = useState(false);
  const inFlight = useRef(false);
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => setDone(false), 2500);
    return () => clearTimeout(timer);
  }, [done]);

  const load = () => {
    setSnapshots(null);
    setFailed(false);
    apiListSnapshots()
      .then(setSnapshots)
      .catch(() => setFailed(true));
  };

  useEffect(() => { if (isAuthenticated) load(); }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col gap-7">
        <SettingRow label="Version history" description="Snapshots of your tabs you can restore.">
          <div className="rounded-lg border border-ink/[0.08] bg-ink/[0.02] px-5 py-4 text-fg-subtle text-sm font-sans leading-relaxed">
            Sign in to keep a version history of your spaces and restore earlier states.
          </div>
        </SettingRow>
      </div>
    );
  }

  // An omitted revision retries only the download after an acknowledged restore.
  // Never repeat the destructive POST just because its subsequent pull failed.
  const handleRestore = async (revision?: number) => {
    if (inFlight.current || (revision !== undefined && pendingPull)) return;
    if (revision === undefined && !pendingPull) return;
    inFlight.current = true;
    setRestoring(true);
    setDone(false);
    setRestoreError(null);
    setConfirming(null);
    setPreviewing(null);
    let serverRestored = revision === undefined;
    const pullFailure = "The version was restored on the server, but is not fully loaded on this device. Retry loading the current server workspace before making more changes.";
    try {
      if (revision !== undefined) await apiRestoreSnapshot(revision);
      if (!active.current) return;
      serverRestored = true;
      setPendingPull(true);
      const applied = await pullAndOverwrite(); // server is authoritative after a restore
      if (!active.current) return;
      if (!applied) {
        setRestoreError(pullFailure);
        return;
      }
      setPendingPull(false);
      setDone(true);
      load();
    } catch (_) {
      if (active.current) {
        setRestoreError(serverRestored
          ? pullFailure
          : "Could not confirm the restore. The server may have received it. Check your workspace and version history before trying again.");
      }
    } finally {
      inFlight.current = false;
      if (active.current) setRestoring(false);
    }
  };

  const confirmingSnap = snapshots?.find(s => s.revision === confirming) ?? null;
  const previewingSnap = snapshots?.find(s => s.revision === previewing) ?? null;

  return (
    <div className="flex flex-col gap-7">
      <SettingRow label="Version history" description="Preview and restore retained cloud versions. Syncs within 30 minutes can share a version; older versions are removed at your plan’s history limit. Export JSON to keep a separate local backup.">
        <div className="flex flex-col gap-2.5">
          {failed && <div className="text-fg-subtle text-xs font-sans">Couldn't load history.</div>}
          {!failed && snapshots === null && <div className="text-fg-subtle text-xs font-sans">Loading…</div>}
          {!failed && snapshots?.length === 0 && <div className="text-fg-subtle text-xs font-sans">No snapshots yet. They appear after your tabs sync.</div>}
          {restoring && <div className="text-fg-subtle text-xs font-sans">Restoring…</div>}
          {restoreError && <div role="alert" className="text-danger text-xs font-sans">{restoreError}</div>}
          {pendingPull && (
            <Button variant="secondary" size="sm" className="self-start" disabled={restoring} onClick={() => { void handleRestore(); }}>
              Retry loading workspace
            </Button>
          )}
          {done && <div className="text-xs font-sans" style={{ color: 'var(--accent-text)' }}>Restored.</div>}
          {snapshots?.map(s => (
            <SnapshotRow
              key={s.revision}
              snapshot={s}
              restoreDisabled={restoring || pendingPull}
              onPreview={() => setPreviewing(s.revision)}
              onRestore={() => setConfirming(s.revision)}
            />
          ))}
        </div>
      </SettingRow>

      {previewingSnap && (
        <SnapshotPreviewModal
          snapshot={previewingSnap}
          open={previewing !== null}
          restoreDisabled={restoring || pendingPull}
          onOpenChange={(o) => { if (!o) setPreviewing(null); }}
          onRestore={() => { setPreviewing(null); setConfirming(previewingSnap.revision); }}
        />
      )}

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(o) => { if (!o) setConfirming(null); }}
        title={confirmingSnap ? `Restore version v${confirmingSnap.revision}?` : 'Restore version?'}
        message={confirmingSnap
          ? `Your current tabs are replaced with this snapshot from ${formatRelativeTime(new Date(confirmingSnap.created_at).getTime())} (${confirmingSnap.space_count} space${confirmingSnap.space_count !== 1 ? 's' : ''} · ${confirmingSnap.tab_count} tab${confirmingSnap.tab_count !== 1 ? 's' : ''}). The current cloud version is saved to history first, so you can restore it.`
          : ''}
        // The one thing restoring can lose is unsynced local work: offer the export right here.
        start={<ModalLink onClick={exportWorkspace}>Export JSON</ModalLink>}
        confirmLabel="Restore version"
        destructive={false}
        onConfirm={() => { if (confirming !== null) handleRestore(confirming); }}
      />
    </div>
  );
}

function SnapshotRow({ snapshot, onPreview, onRestore, restoreDisabled }: {
  snapshot: SnapshotInfo;
  onPreview: () => void;
  onRestore: () => void;
  restoreDisabled: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink/[0.08] bg-ink/[0.02] px-4 py-3.5">
      <div className="min-w-0 flex flex-col gap-0.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-fg-subtle text-[11px] font-mono shrink-0">v{snapshot.revision}</span>
          <span className="text-fg-muted text-sm font-sans truncate">
            {formatRelativeTime(new Date(snapshot.created_at).getTime())}
          </span>
        </div>
        <span className="text-fg-subtle text-xs font-sans">
          {snapshot.space_count} space{snapshot.space_count !== 1 ? 's' : ''} · {snapshot.tab_count} tab{snapshot.tab_count !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <Button variant="ghost" size="sm" onClick={onPreview}>Preview</Button>
        <Button variant="ghost" size="sm" disabled={restoreDisabled} onClick={onRestore}>Restore</Button>
      </div>
    </div>
  );
}

// --- Snapshot preview ---
//
// Goal: let someone UNDERSTAND a snapshot before restoring (how many spaces, which
// groups, what is inside), not read a dump of every tab. It uses the same tree as
// the sign-in choice (WorkspaceTree): spaces, then each group as one path line
// (project › category › group), then tabs on demand. A small snapshot opens fully.

function SnapshotPreviewModal({ snapshot, open, onOpenChange, onRestore, restoreDisabled }: {
  snapshot: SnapshotInfo;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRestore: () => void;
  restoreDisabled: boolean;
}) {
  const [tree, setTree] = useState<SavedSpace[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTree(null);
    setFailed(false);
    apiGetSnapshot(snapshot.revision)
      .then(setTree)
      .catch(() => setFailed(true));
  }, [open, snapshot.revision]);


  return (
    // Opening a preview focuses Close, not Restore: one Enter must not restore (modal standard §8).
    // The tree is the same one the sign-in choice shows (spaces, then group paths, then tabs),
    // in its own bounded box so the footer stays in view (§3).
    <Modal kind="dialog" size="m" open={open} onOpenChange={onOpenChange} initialFocus="close">
      <ModalHeader title={`Version v${snapshot.revision}`}
        description={`${formatRelativeTime(new Date(snapshot.created_at).getTime())} · ${snapshot.space_count} space${snapshot.space_count !== 1 ? 's' : ''} · ${snapshot.tab_count} tab${snapshot.tab_count !== 1 ? 's' : ''}`} />
      <div className="flex min-h-[160px] flex-1 flex-col">
        {tree === null
          ? <p className="rounded-lg border border-ink/10 p-3 text-xs text-fg-subtle">{failed ? "Couldn't load this snapshot." : "Loading…"}</p>
          : <SourceColumn spaces={tree} includeEmpty emptyText="This snapshot is empty." />}
      </div>
      <ModalFooter primary={{ label: "Restore version", disabled: restoreDisabled, onClick: onRestore }} />
    </Modal>
  );
}


