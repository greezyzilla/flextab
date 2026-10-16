import { useRef, useState, useEffect, useMemo, type ChangeEvent } from "react";
import { ChevronRight } from "lucide-react";
import { useAuthStore } from "~src/store/useAuthStore";
import { formatRelativeTime } from "~src/store/useSyncStore";
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore";
import { apiListSnapshots, apiGetSnapshot, apiRestoreSnapshot, type SnapshotInfo } from "~src/services/snapshots";
import { pullAndOverwrite } from "~src/services/syncEngine";
import { parseWorkspaceBackup } from "~src/services/workspaceBackup";
import type { SavedSpace, SavedGroup, SavedTab } from "~src/types";
import * as yjs from "~src/lib/yjsDoc";
import { ConfirmDialog } from "~src/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogTitle } from "~src/components/ui/dialog";
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
  const [pendingImport, setPendingImport] = useState<SavedSpace[] | null>(null);

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
        const data = parseWorkspaceBackup(JSON.parse(ev.target?.result as string));
        // Validated — defer the destructive replace until the user confirms.
        setPendingImport(data);
      } catch (err) {
        setImportStatus({ type: 'error', message: err instanceof Error ? err.message : 'Failed to import' });
      }
    };
    reader.onerror = () => {
      setImportStatus({ type: 'error', message: 'Could not read this backup. Please try again.' });
    };
    reader.readAsText(file);
    // Reset so the same file can be re-imported
    e.target.value = '';
  };

  return (
    <div className="flex flex-col gap-7">
      <ConfirmDialog
        open={!!pendingImport}
        onOpenChange={(o) => { if (!o) setPendingImport(null); }}
        title="Replace your workspace?"
        message={
          <>
            Importing replaces your current workspace with{" "}
            <span className="text-white/80">{pendingImport?.length ?? 0} space{(pendingImport?.length ?? 0) !== 1 ? "s" : ""}</span>.
            This can&apos;t be undone.
          </>
        }
        confirmLabel="Import & replace"
        onConfirm={() => {
          if (!pendingImport) return;
          try {
            yjs.setSpaces(pendingImport);
            setImportStatus({ type: 'success', message: `Imported ${pendingImport.length} space${pendingImport.length !== 1 ? 's' : ''}` });
          } catch (err) {
            setImportStatus({ type: 'error', message: err instanceof Error ? err.message : 'Failed to import' });
          } finally {
            setPendingImport(null);
          }
        }}
      />
      <SettingRow label="Export" description="Download all your data as a JSON file.">
        <div className="flex items-center gap-3">
          <Button variant="secondary" size="sm" onClick={handleExport}>Export JSON</Button>
          <span className="text-white/25 text-xs font-sans">
            {savedSpaces.length} space{savedSpaces.length !== 1 ? 's' : ''} · {totalTabs} tab{totalTabs !== 1 ? 's' : ''} · {formatSize(dataSize)}
          </span>
        </div>
      </SettingRow>

      <SettingRow label="Import" description="Replace all data from a JSON backup. This overwrites existing data.">
        <div className="flex flex-col gap-2">
          <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()} className="self-start">Import JSON</Button>
          <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
          {importStatus && (
            <div role="status" className={`text-xs font-sans ${importStatus.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
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
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-5 py-4 text-white/50 text-sm font-sans leading-relaxed">
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
      <SettingRow label="Version history" description="Each sync saves a version of your workspace. Preview one to see exactly what it holds, then restore to roll your tabs back — your current version stays in history, so a restore is undoable.">
        <div className="flex flex-col gap-2.5">
          {failed && <div className="text-white/30 text-xs font-sans">Couldn't load history.</div>}
          {!failed && snapshots === null && <div className="text-white/30 text-xs font-sans">Loading…</div>}
          {!failed && snapshots?.length === 0 && <div className="text-white/30 text-xs font-sans">No snapshots yet — they appear after your tabs sync.</div>}
          {restoring && <div className="text-white/40 text-xs font-sans">Restoring…</div>}
          {restoreError && <div role="alert" className="text-red-400 text-xs font-sans">{restoreError}</div>}
          {pendingPull && (
            <Button variant="secondary" size="sm" className="self-start" disabled={restoring} onClick={() => { void handleRestore(); }}>
              Retry loading workspace
            </Button>
          )}
          {done && <div className="text-xs font-sans" style={{ color: 'var(--accent)' }}>Restored.</div>}
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
          ? `This replaces your current tabs with this snapshot from ${formatRelativeTime(new Date(confirmingSnap.created_at).getTime())} (${confirmingSnap.space_count} space${confirmingSnap.space_count !== 1 ? 's' : ''} · ${confirmingSnap.tab_count} tab${confirmingSnap.tab_count !== 1 ? 's' : ''}). Your current version stays in history, so you can undo this.`
          : ''}
        confirmLabel="Restore"
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
    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.08] bg-white/[0.02] px-4 py-3.5">
      <div className="min-w-0 flex flex-col gap-0.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-white/25 text-[11px] font-mono shrink-0">v{snapshot.revision}</span>
          <span className="text-white/75 text-sm font-sans truncate">
            {formatRelativeTime(new Date(snapshot.created_at).getTime())}
          </span>
        </div>
        <span className="text-white/35 text-xs font-sans">
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

// --- Snapshot preview: a collapsible tree of the stored workspace ---
//
// Goal: let someone UNDERSTAND a snapshot before restoring — how many spaces,
// which projects/categories, which groups and what's inside — not read a dump of
// every tab. Each level (space → project → category → group) is a collapsible
// branch showing its tab count; tabs only appear when their group is opened. The
// structure is expanded by default; tabs stay collapsed so the default view is a
// scannable overview.

type PKind = 'space' | 'project' | 'category' | 'group';
interface PNode {
  id: string;
  name: string;
  kind: PKind;
  count: number;      // tabs contained
  color?: string;     // space accent
  abbr?: string;      // space initials
  children?: PNode[]; // sub-branches
  tabs?: SavedTab[];  // group leaves
}

const tabsInGroups = (groups: SavedGroup[] | undefined) =>
  (groups ?? []).reduce((n, g) => n + (g.tabs ?? []).length, 0);

function buildPreviewTree(spaces: SavedSpace[]): PNode[] {
  return (spaces ?? []).map(s => ({
    id: s.id,
    name: s.name || 'Untitled space',
    kind: 'space' as const,
    color: s.color,
    abbr: (s.abbreviation || (s.name || '?').slice(0, 2)).toUpperCase(),
    count: (s.projects ?? []).reduce((n, p) => n + (p.categories ?? []).reduce((m, c) => m + tabsInGroups(c.groups), 0), 0),
    children: (s.projects ?? []).map(p => ({
      id: p.id,
      name: p.name || 'Untitled project',
      kind: 'project' as const,
      count: (p.categories ?? []).reduce((m, c) => m + tabsInGroups(c.groups), 0),
      children: (p.categories ?? []).map(c => ({
        id: c.id,
        name: c.name || 'Untitled category',
        kind: 'category' as const,
        count: tabsInGroups(c.groups),
        children: (c.groups ?? []).map(g => ({
          id: g.id,
          name: g.name || 'Untitled group',
          kind: 'group' as const,
          count: (g.tabs ?? []).length,
          tabs: g.tabs ?? [],
        })),
      })),
    })),
  }));
}

// Every branch id except groups — the default-expanded set (structure shown,
// tabs hidden until a group is opened).
function structureIds(nodes: PNode[]): string[] {
  const ids: string[] = [];
  const walk = (n: PNode) => { if (n.kind !== 'group') { ids.push(n.id); (n.children ?? []).forEach(walk); } };
  nodes.forEach(walk);
  return ids;
}

function SnapshotPreviewModal({ snapshot, open, onOpenChange, onRestore, restoreDisabled }: {
  snapshot: SnapshotInfo;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRestore: () => void;
  restoreDisabled: boolean;
}) {
  const [tree, setTree] = useState<PNode[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setTree(null);
    setFailed(false);
    apiGetSnapshot(snapshot.revision)
      .then(spaces => {
        const t = buildPreviewTree(spaces);
        setTree(t);
        setExpanded(new Set(structureIds(t)));
      })
      .catch(() => setFailed(true));
  }, [open, snapshot.revision]);

  const toggle = (id: string) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[560px] max-w-[92vw] max-h-[85vh] p-0 flex flex-col gap-0">
        {/* Header: just the title + meta. The Dialog's close (X) lives in the
            top-right corner; the title is short so it never reaches it. The
            primary action sits in the footer instead of colliding here. */}
        <div className="flex flex-col gap-1 p-5 pr-12 border-b border-black-800 shrink-0">
          <DialogTitle className="text-white/90 text-sm font-medium">Version v{snapshot.revision}</DialogTitle>
          <span className="text-white/40 text-xs font-sans">
            {formatRelativeTime(new Date(snapshot.created_at).getTime())} · {snapshot.space_count} space{snapshot.space_count !== 1 ? 's' : ''} · {snapshot.tab_count} tab{snapshot.tab_count !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-2 min-h-[160px]">
          {failed && <div className="text-white/30 text-xs font-sans p-3">Couldn't load this snapshot.</div>}
          {!failed && tree === null && <div className="text-white/30 text-xs font-sans p-3">Loading…</div>}
          {tree?.length === 0 && <div className="text-white/30 text-xs font-sans p-3">This snapshot is empty.</div>}
          {tree?.map(node => (
            <PreviewNode key={node.id} node={node} depth={0} expanded={expanded} onToggle={toggle} />
          ))}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-black-800 shrink-0">
          <Button variant="default" size="sm" disabled={restoreDisabled} onClick={onRestore}>Restore this version</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// One branch of the snapshot tree (space/project/category/group); its tabs render
// as favicon rows when a group is opened.
function PreviewNode({ node, depth, expanded, onToggle }: {
  node: PNode; depth: number; expanded: Set<string>; onToggle: (id: string) => void;
}) {
  const isOpen = expanded.has(node.id);
  const indent = 8 + depth * 16;
  const nameCls =
    node.kind === 'space' ? 'text-white/90 text-sm font-medium'
      : node.kind === 'group' ? 'text-white/55 text-xs'
        : 'text-white/80 text-xs font-medium';

  return (
    <div className="flex flex-col">
      <button
        onClick={() => onToggle(node.id)}
        className="group flex w-full items-center gap-2 rounded-md py-1.5 pr-2.5 text-left transition-colors hover:bg-white/[0.04]"
        style={{ paddingLeft: indent }}
        aria-expanded={isOpen}
      >
        <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-white/25 transition-transform group-hover:text-white/45 ${isOpen ? 'rotate-90' : ''}`} strokeWidth={2} />
        {node.kind === 'space' && (
          <span
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[9px] font-semibold text-white/85"
            style={{ backgroundColor: node.color ? `${node.color}55` : 'var(--accent-subtle)' }}
          >
            {node.abbr}
          </span>
        )}
        <span className={`min-w-0 flex-1 truncate font-sans ${nameCls}`}>{node.name}</span>
        <span className="shrink-0 text-white/30 text-[11px] font-sans tabular-nums">{node.count}</span>
      </button>

      {isOpen && (node.children ?? []).map(child => (
        <PreviewNode key={child.id} node={child} depth={depth + 1} expanded={expanded} onToggle={onToggle} />
      ))}

      {isOpen && node.tabs && (
        node.tabs.length === 0
          ? <div className="text-white/20 text-xs font-sans py-1" style={{ paddingLeft: indent + 24 }}>Empty group</div>
          : node.tabs.map(t => (
            <div key={t.id} className="flex items-center gap-2 min-w-0 py-1 pr-2.5" style={{ paddingLeft: indent + 24 }}>
              {t.favicon
                ? <img src={t.favicon} alt="" referrerPolicy="no-referrer" className="h-4 w-4 rounded shrink-0" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
                : <span className="h-4 w-4 rounded bg-white/10 shrink-0" />}
              <span className="text-white/55 text-xs font-sans truncate">{t.title || t.url}</span>
            </div>
          ))
      )}
    </div>
  );
}

