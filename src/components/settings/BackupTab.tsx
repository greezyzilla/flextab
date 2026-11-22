import { ArrowDownUp, Clock } from "lucide-react";
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
import { Badge } from "~src/components/ui/badge";
import { DoneLine } from "~src/components/ui/done-check";
import { SettingRow, SettingsList, SettingsListRow, SettingsNotice, SettingsPage, SettingsSection, formatDate, formatBytes } from "./shared";

// Backup groups the two "save & restore your workspace" surfaces: automatic
// version history and manual export/import. (History needs sign-in; export/
// import works locally too — each section handles its own auth state.)
export function BackupTab() {
  // Recovery state belongs to the account whose snapshot was selected.
  const historyAccount = useAuthStore(s => s.isAuthenticated ? s.user?.id ?? "authenticated" : "signed-out");
  return (
    <SettingsPage>
      {/* Export/Import first: short & fixed. Version history last: it grows
          unboundedly, so keep it at the bottom instead of pushing everything
          else down. */}
      <DataTab />
      <HistoryTab key={historyAccount} />
    </SettingsPage>
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
    <SettingsSection title="Export and import" icon={ArrowDownUp} subtitle="Move your tabs in and out of FlexTab.">
      <ImportDialog
        parsed={pendingImport?.parsed ?? null}
        fileName={pendingImport?.fileName ?? ""}
        onClose={() => setPendingImport(null)}
        onDone={(message) => setImportStatus({ type: 'success', message })}
      />
      <SettingRow label="Export" description={`All your data as JSON: ${savedSpaces.length} space${savedSpaces.length !== 1 ? 's' : ''}, ${totalTabs} tab${totalTabs !== 1 ? 's' : ''}, ${formatSize(dataSize)}.`} info="Downloads all your data as a JSON file you can import later.">
        <Button variant="ghost" size="sm" onClick={handleExport}>Export JSON</Button>
      </SettingRow>

      <SettingRow label="Import" description="Add tabs from a backup or another app." info="From a FlexTab backup (.json), a bookmarks export from any browser (.html), or a OneTab export (.txt). You see what's inside before anything changes.">
        <Button variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()}>Import…</Button>
        <input ref={fileInputRef} type="file" accept=".json,.html,.htm,.txt" onChange={handleImport} className="hidden" />
        {importStatus && (importStatus.type === 'success'
          ? <DoneLine>{importStatus.message}</DoneLine>
          : <div role="status" className="text-xs font-sans text-danger">{importStatus.message}</div>)}
      </SettingRow>
    </SettingsSection>
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
  // What the restore brought back, said once it landed (TASK-96); stays until the next restore.
  const [done, setDone] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [pendingPull, setPendingPull] = useState(false);
  const inFlight = useRef(false);
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

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
      <SettingsSection title="Version history" icon={Clock} subtitle="Earlier states of your spaces you can go back to." notice={<SettingsNotice>Sign in to keep a version history of your spaces and restore earlier states.</SettingsNotice>}>
        {null}
      </SettingsSection>
    );
  }

  // An omitted revision retries only the download after an acknowledged restore.
  // Never repeat the destructive POST just because its subsequent pull failed.
  const handleRestore = async (revision?: number) => {
    if (inFlight.current || (revision !== undefined && pendingPull)) return;
    if (revision === undefined && !pendingPull) return;
    inFlight.current = true;
    setRestoring(true);
    setDone(null);
    setRestoreError(null);
    setConfirming(null);
    setPreviewing(null);
    const snap = snapshots?.find(s => s.revision === revision);
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
      setDone(snap
        ? `Restored v${snap.revision}. ${snap.tab_count} tab${snap.tab_count === 1 ? '' : 's'} in ${snap.space_count} space${snap.space_count === 1 ? '' : 's'}.`
        : 'Restored.');
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
    <SettingsSection
      title="Version history"
      icon={Clock}
      subtitle="Earlier states of your spaces you can go back to."
      notice={restoreError || pendingPull ? (
          <SettingsNotice tone="warning">
            {restoreError && <span role="alert">{restoreError} </span>}
            {pendingPull && <Button variant="link" size="inline" disabled={restoring} onClick={() => { void handleRestore(); }}>Retry loading workspace</Button>}
          </SettingsNotice>
        ) : restoring ? <SettingsNotice>Restoring…</SettingsNotice>
        : done ? <DoneLine>{done}</DoneLine>
        : undefined}
    >
      <SettingsList
        label="Versions"
        failed={failed ? { title: "Couldn't load history.", says: "Check your connection, then try again.", onRetry: load } : undefined}
        loading={snapshots === null ? { label: "Loading versions" } : undefined}
        empty={snapshots?.length === 0 ? { title: "No snapshots yet.", says: "They appear after your tabs sync." } : undefined}
      >
        {snapshots?.map(s => (
          <SnapshotRow
            key={s.revision}
            snapshot={s}
            restoreDisabled={restoring || pendingPull}
            onPreview={() => setPreviewing(s.revision)}
            onRestore={() => setConfirming(s.revision)}
          />
        ))}
      </SettingsList>

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
    </SettingsSection>
  );
}

function SnapshotRow({ snapshot, onPreview, onRestore, restoreDisabled }: {
  snapshot: SnapshotInfo;
  onPreview: () => void;
  onRestore: () => void;
  restoreDisabled: boolean;
}) {
  return (
    <SettingsListRow
      title={<>
        <span className="truncate">{formatRelativeTime(new Date(snapshot.created_at).getTime())}</span>
        {/* Neutral, not accent: in Settings an accent badge means "the current one" (Current, This device). */}
        {snapshot.kind === "before_resolution" && (
          <Badge variant="outline" size="sm" className="shrink-0">Before resolving a conflict</Badge>
        )}
      </>}
      meta={`v${snapshot.revision} · ${snapshot.space_count} space${snapshot.space_count !== 1 ? 's' : ''} · ${snapshot.tab_count} tab${snapshot.tab_count !== 1 ? 's' : ''}`}
      action={<>
        <Button variant="ghost" size="sm" onClick={onPreview}>Preview</Button>
        <Button variant="ghost" size="sm" disabled={restoreDisabled} onClick={onRestore}>Restore</Button>
      </>}
    />
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
      <div className="flex min-h-40 flex-1 flex-col">
        {tree === null
          ? <p className="rounded-lg border border-ink/10 p-3 text-xs text-fg-subtle">{failed ? "Couldn't load this snapshot." : "Loading…"}</p>
          : <SourceColumn spaces={tree} includeEmpty emptyText="This snapshot is empty." />}
      </div>
      <ModalFooter primary={{ label: "Restore version", disabled: restoreDisabled, onClick: onRestore }} />
    </Modal>
  );
}


