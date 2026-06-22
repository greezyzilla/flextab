import { useRef, useState, useEffect, useMemo } from "react";
import { useSettingsStore, ACCENT_COLORS, type GroupLayout, type Density, type AccentColor } from "~src/store/useSettingsStore";
import { useAuthStore } from "~src/store/useAuthStore";
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore";
import { useSyncStore, type SyncStatus } from "~src/store/useSyncStore";
import { apiChangePassword, getDeviceId } from "~src/services/api";
import { apiGetDevices, type DeviceInfo } from "~src/services/device";
import { syncNow } from "~src/services/syncEngine";
import * as yjs from "~src/lib/yjsDoc";

type SettingsTab = 'appearance' | 'layout' | 'sync' | 'account' | 'data';

export function GlobalSettingsModal({ onClose }: { onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-black-900 border border-black-700 rounded-xl w-[560px] h-[420px] flex shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Sidebar */}
        <div className="w-44 border-r border-black-800 p-3 flex flex-col gap-1 shrink-0">
          <div className="text-white/50 font-sans text-[11px] font-medium px-2.5 py-1.5 mb-1">Settings</div>
          <SidebarItem active={activeTab === 'appearance'} onClick={() => setActiveTab('appearance')} icon={<PaletteIcon />} label="Appearance" />
          <SidebarItem active={activeTab === 'layout'} onClick={() => setActiveTab('layout')} icon={<LayoutIcon />} label="Layout" />
          <SidebarItem active={activeTab === 'sync'} onClick={() => setActiveTab('sync')} icon={<SyncIcon />} label="Sync" />
          <SidebarItem active={activeTab === 'account'} onClick={() => setActiveTab('account')} icon={<UserIcon />} label="Account" />
          <SidebarItem active={activeTab === 'data'} onClick={() => setActiveTab('data')} icon={<DataIcon />} label="Data" />
        </div>

        {/* Content */}
        <div className="flex-1 p-5 overflow-y-auto">
          {activeTab === 'appearance' && <AppearanceTab />}
          {activeTab === 'layout' && <LayoutTab />}
          {activeTab === 'sync' && <SyncTab />}
          {activeTab === 'account' && <AccountTab />}
          {activeTab === 'data' && <DataTab />}
        </div>
      </div>
    </div>
  );
}

function SidebarItem({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-sans transition-colors w-full text-left ${
        active ? 'text-white/80' : 'text-white/40 hover:text-white/60 hover:bg-white/[0.03]'
      }`}
      style={active ? { backgroundColor: 'var(--accent-subtle)', color: 'var(--accent)' } : undefined}
    >
      {icon}
      {label}
    </button>
  );
}

// --- Appearance Tab ---

function AppearanceTab() {
  const {
    accentColor, setAccentColor,
    customAccent, setCustomAccent,
    bgTint, setBgTint,
  } = useSettingsStore();
  const pickerRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-5">
      <SettingRow label="Accent Color" description="Active states, highlights, and focus rings.">
        <div className="flex items-center gap-2">
          {(Object.keys(ACCENT_COLORS) as AccentColor[]).map(key => (
            <button
              key={key}
              onClick={() => setAccentColor(key)}
              className={`w-6 h-6 rounded-full border-2 transition-all ${
                !customAccent && accentColor === key ? 'border-white/70 scale-110' : 'border-transparent hover:border-white/30'
              }`}
              style={{ backgroundColor: ACCENT_COLORS[key].value }}
              title={ACCENT_COLORS[key].label}
            />
          ))}
          <button
            onClick={() => pickerRef.current?.click()}
            className={`w-6 h-6 rounded-full border-2 transition-all flex items-center justify-center ${
              customAccent ? 'border-white/70 scale-110' : 'border-white/20 hover:border-white/40'
            }`}
            style={{ backgroundColor: customAccent || 'transparent' }}
            title="Custom color"
          >
            {!customAccent && (
              <svg className="w-3 h-3 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            )}
          </button>
          <input
            ref={pickerRef}
            type="color"
            value={customAccent || ACCENT_COLORS[accentColor].value}
            onChange={e => setCustomAccent(e.target.value)}
            className="sr-only"
          />
        </div>
      </SettingRow>

      <SettingRow label="Background Tint" description="Tints the background with the accent hue.">
        <div className="flex items-center gap-3">
          <input
            type="range" min={0} max={15} value={bgTint}
            onChange={e => setBgTint(Number(e.target.value))}
            className="slider-custom flex-1"
          />
          <span className="text-white/30 text-[11px] font-sans w-8 text-right shrink-0">{bgTint}%</span>
        </div>
      </SettingRow>
    </div>
  );
}

// --- Layout Tab ---

function LayoutTab() {
  const {
    groupLayout, setGroupLayout,
    gridColumns, setGridColumns,
    density, setDensity,
  } = useSettingsStore();

  return (
    <div className="flex flex-col gap-5">
      <SettingRow label="Group Layout" description="How saved tab groups are displayed.">
        <ToggleGroup<GroupLayout>
          value={groupLayout}
          onChange={setGroupLayout}
          options={[
            { value: 'list', label: 'List', icon: <ListIcon /> },
            { value: 'grid', label: 'Grid', icon: <GridIcon /> },
          ]}
        />
      </SettingRow>

      {groupLayout === 'grid' && (
        <SettingRow label="Grid Columns" description="Number of columns in grid view.">
          <ToggleGroup<string>
            value={String(gridColumns)}
            onChange={(v) => setGridColumns(Number(v))}
            options={[
              { value: '2', label: '2' },
              { value: '3', label: '3' },
              { value: '4', label: '4' },
            ]}
          />
        </SettingRow>
      )}

      <SettingRow label="Density" description="Controls spacing and padding.">
        <ToggleGroup<Density>
          value={density}
          onChange={setDensity}
          options={[
            { value: 'compact', label: 'Compact' },
            { value: 'comfortable', label: 'Comfortable' },
          ]}
        />
      </SettingRow>
    </div>
  );
}

// --- Account Tab ---

function AccountTab() {
  const { user, logout } = useAuthStore();
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    setPwSuccess('');

    if (newPw.length < 8) {
      setPwError('Password must be at least 8 characters');
      return;
    }
    if (newPw !== confirmPw) {
      setPwError('Passwords do not match');
      return;
    }

    setPwLoading(true);
    try {
      await apiChangePassword(currentPw, newPw);
      setPwSuccess('Password updated');
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
    } catch (err: unknown) {
      setPwError(err instanceof Error ? err.message : 'Failed to update password');
    } finally {
      setPwLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Profile info */}
      <SettingRow label="Profile" description="Your account information.">
        {user && (
          <div className="flex items-center gap-3">
            {user.avatar ? (
              <img src={user.avatar} alt={user.name} className="w-8 h-8 rounded-full" />
            ) : (
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white/80 text-xs font-medium" style={{ backgroundColor: 'var(--accent)' }}>
                {user.name.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="flex flex-col min-w-0">
              <span className="text-white/80 text-xs font-sans truncate">{user.name}</span>
              <span className="text-white/30 text-[11px] font-sans truncate">{user.email}</span>
            </div>
            <span className="text-white/20 text-[10px] font-sans border border-white/10 rounded px-1.5 py-0.5 ml-auto shrink-0">
              {user.provider}
            </span>
          </div>
        )}
      </SettingRow>

      {/* Change Password */}
      <SettingRow
        label={user?.has_password ? 'Change Password' : 'Set Password'}
        description={user?.has_password ? 'Update your account password.' : 'Add a password to sign in with email.'}
      >
        <form onSubmit={handleChangePassword} className="flex flex-col gap-2.5">
          {user?.has_password && (
            <input
              type="password"
              placeholder="Current password"
              value={currentPw}
              onChange={e => setCurrentPw(e.target.value)}
              className="w-full px-3 py-2 bg-white/[0.06] border border-white/10 rounded-lg text-white/90 text-xs placeholder:text-white/25 outline-none focus:border-white/25 transition-colors"
            />
          )}
          <input
            type="password"
            placeholder="New password"
            value={newPw}
            onChange={e => setNewPw(e.target.value)}
            className="w-full px-3 py-2 bg-white/[0.06] border border-white/10 rounded-lg text-white/90 text-xs placeholder:text-white/25 outline-none focus:border-white/25 transition-colors"
            minLength={8}
            required
          />
          <input
            type="password"
            placeholder="Confirm new password"
            value={confirmPw}
            onChange={e => setConfirmPw(e.target.value)}
            className="w-full px-3 py-2 bg-white/[0.06] border border-white/10 rounded-lg text-white/90 text-xs placeholder:text-white/25 outline-none focus:border-white/25 transition-colors"
            minLength={8}
            required
          />
          {pwError && <div className="text-red-400 text-[11px]">{pwError}</div>}
          {pwSuccess && <div className="text-green-400 text-[11px]">{pwSuccess}</div>}
          <button
            type="submit"
            disabled={pwLoading}
            className="self-start px-3.5 py-1.5 rounded-lg text-xs font-sans font-medium text-white transition-colors disabled:opacity-50"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            {pwLoading ? 'Saving...' : user?.has_password ? 'Update password' : 'Set password'}
          </button>
        </form>
      </SettingRow>

      {/* Sign out */}
      <div className="pt-2 border-t border-white/5">
        <button
          onClick={logout}
          className="text-red-400/70 hover:text-red-400 text-xs font-sans transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

// --- Data Tab ---

function DataTab() {
  const { savedSpaces } = useSavedSpacesStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

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

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportStatus(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (!Array.isArray(data)) throw new Error('Invalid format: expected array of spaces');
        // Basic validation
        for (const space of data) {
          if (!space.id || !space.name || !Array.isArray(space.projects)) {
            throw new Error('Invalid space format');
          }
        }
        yjs.setSpaces(data);
        setImportStatus({ type: 'success', message: `Imported ${data.length} space${data.length !== 1 ? 's' : ''}` });
      } catch (err) {
        setImportStatus({ type: 'error', message: err instanceof Error ? err.message : 'Failed to import' });
      }
    };
    reader.readAsText(file);
    // Reset so the same file can be re-imported
    e.target.value = '';
  };

  return (
    <div className="flex flex-col gap-5">
      <SettingRow label="Export" description="Download all your data as a JSON file.">
        <div className="flex items-center gap-3">
          <button
            onClick={handleExport}
            className="px-3.5 py-1.5 rounded-lg text-xs font-sans font-medium text-white/80 bg-white/[0.08] hover:bg-white/[0.12] transition-colors"
          >
            Export JSON
          </button>
          <span className="text-white/25 text-[11px] font-sans">
            {savedSpaces.length} space{savedSpaces.length !== 1 ? 's' : ''} · {totalTabs} tab{totalTabs !== 1 ? 's' : ''} · {formatSize(dataSize)}
          </span>
        </div>
      </SettingRow>

      <SettingRow label="Import" description="Replace all data from a JSON backup. This overwrites existing data.">
        <div className="flex flex-col gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="self-start px-3.5 py-1.5 rounded-lg text-xs font-sans font-medium text-white/80 bg-white/[0.08] hover:bg-white/[0.12] transition-colors"
          >
            Import JSON
          </button>
          <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
          {importStatus && (
            <div className={`text-[11px] font-sans ${importStatus.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
              {importStatus.message}
            </div>
          )}
        </div>
      </SettingRow>
    </div>
  );
}

// --- Sync Tab ---

const SYNC_STATUS_META: Record<SyncStatus, { label: string; color: string; pulse?: boolean }> = {
  online:     { label: 'Connected',    color: '#22c55e' },
  connecting: { label: 'Connecting…',  color: '#eab308', pulse: true },
  syncing:    { label: 'Syncing…',     color: '#eab308', pulse: true },
  offline:    { label: 'Offline',      color: '#a3a3a3' },
  paused:     { label: 'Auto-sync off', color: '#a3a3a3' },
  error:      { label: 'Sync error',   color: '#ef4444' },
};

function formatRelativeTime(ts: number | null): string {
  if (!ts) return 'Not synced yet';
  const diff = Date.now() - ts;
  if (diff < 5_000) return 'Just now';
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function SyncTab() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const { autoSync, setAutoSync } = useSettingsStore();
  const status = useSyncStore(s => s.status);
  const [syncing, setSyncing] = useState(false);
  const [devicesNonce, setDevicesNonce] = useState(0);

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col gap-5">
        <SettingRow label="Sync" description="Sync your spaces, groups, and tabs across every device.">
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-white/50 text-xs font-sans leading-relaxed">
            You're using FlexTab locally on this device. Sign in to back up and sync your tabs across devices.
          </div>
        </SettingRow>
      </div>
    );
  }

  const meta = SYNC_STATUS_META[status];

  const handleSyncNow = async () => {
    setSyncing(true);
    await syncNow();
    setSyncing(false);
    setDevicesNonce(n => n + 1); // refresh the device list after a manual sync
  };

  return (
    <div className="flex flex-col gap-5">
      <SettingRow label="Status" description="Realtime connection with your account.">
        <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span
              className={`w-2 h-2 rounded-full ${meta.pulse ? 'animate-pulse' : ''}`}
              style={{ backgroundColor: meta.color }}
            />
            <div className="flex flex-col">
              <span className="text-white/80 text-xs font-sans font-medium">{meta.label}</span>
              <span className="text-white/30 text-[11px] font-sans">Last synced {formatRelativeTime(lastSyncedAt)}</span>
            </div>
          </div>
          <button
            onClick={handleSyncNow}
            disabled={syncing || status === 'syncing'}
            className="text-white/60 hover:text-white/90 text-[11px] font-sans px-3 py-1.5 rounded-md border border-white/10 hover:border-white/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {syncing || status === 'syncing' ? 'Syncing…' : 'Sync now'}
          </button>
        </div>
      </SettingRow>

      <SettingRow label="Auto-sync" description="Keep changes in sync across devices automatically. When off, use “Sync now”.">
        <Switch checked={autoSync} onChange={setAutoSync} label={autoSync ? 'On' : 'Off'} />
      </SettingRow>

      <DevicesSection refresh={devicesNonce} />
    </div>
  );
}

function DevicesSection({ refresh }: { refresh: number }) {
  const [devices, setDevices] = useState<DeviceInfo[] | null>(null);
  const [thisDeviceId, setThisDeviceId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    getDeviceId().then(id => { if (active) setThisDeviceId(id); });
    apiGetDevices()
      .then(d => { if (active) { setDevices(d); setFailed(false); } })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [refresh]);

  const lastSyncedDevice = useMemo(() => {
    if (!devices) return null;
    return devices
      .filter(d => d.last_synced_at)
      .sort((a, b) => new Date(b.last_synced_at!).getTime() - new Date(a.last_synced_at!).getTime())[0] ?? null;
  }, [devices]);

  return (
    <SettingRow label="Devices" description="Devices that have used this account.">
      {lastSyncedDevice && (
        <div className="text-white/40 text-[11px] font-sans -mt-1">
          Last synced from <span className="text-white/60">{lastSyncedDevice.label}</span> · {formatRelativeTime(new Date(lastSyncedDevice.last_synced_at!).getTime())}
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        {failed && <div className="text-white/30 text-[11px] font-sans">Couldn't load devices.</div>}
        {!failed && devices === null && <div className="text-white/30 text-[11px] font-sans">Loading…</div>}
        {!failed && devices?.length === 0 && <div className="text-white/30 text-[11px] font-sans">No devices recorded yet.</div>}
        {devices?.map(d => (
          <div key={d.id} className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-white/70 text-xs font-sans truncate">{d.label}</span>
              {d.id === thisDeviceId && (
                <span className="text-[10px] font-sans px-1.5 py-0.5 rounded shrink-0" style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent)' }}>
                  This device
                </span>
              )}
            </div>
            <span className="text-white/25 text-[10px] font-sans shrink-0">
              {formatRelativeTime(new Date(d.last_seen_at).getTime())}
            </span>
          </div>
        ))}
      </div>
    </SettingRow>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2.5"
    >
      <span
        className={`relative w-9 h-5 rounded-full transition-colors ${checked ? '' : 'bg-white/10'}`}
        style={checked ? { backgroundColor: 'var(--accent)' } : undefined}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : ''}`}
        />
      </span>
      {label && <span className="text-white/50 text-[11px] font-sans">{label}</span>}
    </button>
  );
}

// --- Shared Components ---

function SettingRow({ label, description, children }: { label: string; description: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <div className="text-white/70 font-sans text-xs font-medium">{label}</div>
        <div className="text-white/30 font-sans text-[11px] mt-0.5">{description}</div>
      </div>
      {children}
    </div>
  );
}

function ToggleGroup<T extends string>({ value, onChange, options }: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: React.ReactNode }[];
}) {
  return (
    <div className="flex gap-1.5">
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-sans transition-colors border ${
            value === opt.value
              ? 'border-white/20 text-white/80'
              : 'bg-white/[0.03] border-white/[0.06] text-white/40 hover:text-white/60 hover:border-white/15'
          }`}
          style={value === opt.value ? { backgroundColor: 'var(--accent-subtle)', borderColor: 'var(--accent)' } : undefined}
        >
          {opt.icon}
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// --- Icons ---

function PaletteIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.098 19.902a3.75 3.75 0 0 0 5.304 0l6.401-6.402M6.75 21A3.75 3.75 0 0 1 3 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125V7.5" />
    </svg>
  );
}

function LayoutIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
    </svg>
  );
}

function SyncIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992V4.356M3.985 14.652H8.977v4.992M4.582 9.348a7.5 7.5 0 0 1 12.548-2.852l3.286 3.075M3.584 14.652l3.286 3.075a7.5 7.5 0 0 0 12.548-2.852" />
    </svg>
  );
}

function DataIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
    </svg>
  );
}
