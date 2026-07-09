import { useRef, useState, useEffect, useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { useRoute, navigate, goBack } from "~src/lib/route";
import { useSettingsStore, HUE_PRESETS, FONT_OPTIONS, type GroupLayout, type Density, type FontKey } from "~src/store/useSettingsStore";
import { useAuthStore } from "~src/store/useAuthStore";
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore";
import { useSyncStore, SYNC_STATUS_META, formatRelativeTime } from "~src/store/useSyncStore";
import { apiChangePassword, getDeviceId, apiGetPlan, apiGetCheckoutUrl, apiGetBillingStatus, apiGetTransactions, apiUpdateProfile, apiListIdentities, apiUnbindIdentity, apiGetBindUrl, apiGetAuthProviders, ApiError, type PlanStatus, type PlanLimits, type BillingStatus, type Transaction, type LinkedIdentity } from "~src/services/api";
import { apiGetDevices, type DeviceInfo } from "~src/services/device";
import { apiListSnapshots, apiGetSnapshot, apiRestoreSnapshot, type SnapshotInfo } from "~src/services/snapshots";
import { syncNow, pullAndOverwrite } from "~src/services/syncEngine";
import type { SavedSpace, SavedGroup, SavedTab } from "~src/types";
import * as yjs from "~src/lib/yjsDoc";
import { ConfirmDialog } from "~src/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogTitle } from "~src/components/ui/dialog";
import { Switch } from "~src/components/ui/switch";
import { Slider } from "~src/components/ui/slider";
import { Button } from "~src/components/ui/button";
import { Input } from "~src/components/ui/input";
import { Badge } from "~src/components/ui/badge";
import * as SliderPrimitive from "@radix-ui/react-slider";

type SettingsTab = 'appearance' | 'sync' | 'backup' | 'plan' | 'transactions' | 'account';

const SETTINGS_TABS: SettingsTab[] = ['appearance', 'sync', 'backup', 'plan', 'transactions', 'account'];
export const SETTINGS_ROUTE = '/settings';

/** Whether a route path belongs to the settings page. */
export function isSettingsRoute(route: string): boolean {
  return route === SETTINGS_ROUTE || route.startsWith(SETTINGS_ROUTE + '/');
}

function tabFromRoute(route: string): SettingsTab {
  const seg = route.replace(/^\/settings\/?/, '').split('/')[0];
  return (SETTINGS_TABS as string[]).includes(seg) ? (seg as SettingsTab) : 'appearance';
}

const SECTION_LABEL: Record<SettingsTab, string> = {
  appearance: 'Appearance', sync: 'Sync', backup: 'Backup',
  plan: 'Plan & Usage', transactions: 'Transactions', account: 'Account',
};

// Settings is not its own screen — it reuses the tab-manager layout. The nav
// below drops into the LeftPanel slot and the content into the ContentPanel
// slot (see newtab/index.tsx); both are route-driven off `#/settings/<tab>`.

/** Left navigation column — same footprint/styling as LeftPanel. */
export function SettingsNav() {
  const active = tabFromRoute(useRoute());
  return (
    <div className="w-64 h-full flex flex-col bg-black-900 shrink-0 font-sans">
      <div className="h-16 p-4 flex items-end border-b border-black-800 shrink-0">
        <h1 className="text-white/90 font-sans text-2xl">Settings</h1>
      </div>
      <div className="flex flex-col gap-1 p-3 overflow-y-auto">
        <SettingsNavItem id="appearance" icon={<PaletteIcon />} label="Appearance" active={active === 'appearance'} />
        <SettingsNavItem id="sync" icon={<SyncIcon />} label="Sync" active={active === 'sync'} />
        <SettingsNavItem id="backup" icon={<HistoryIcon />} label="Backup" active={active === 'backup'} />
        <SettingsNavItem id="plan" icon={<PlanIcon />} label="Plan & Usage" active={active === 'plan'} />
        <SettingsNavItem id="transactions" icon={<ReceiptIcon />} label="Transactions" active={active === 'transactions'} />
        <SettingsNavItem id="account" icon={<UserIcon />} label="Account" active={active === 'account'} />
      </div>
    </div>
  );
}

function SettingsNavItem({ id, icon, label, active }: { id: SettingsTab; icon: React.ReactNode; label: string; active: boolean }) {
  return (
    <button
      onClick={() => navigate(`${SETTINGS_ROUTE}/${id}`)}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left font-sans text-sm outline-none transition-colors ${
        active
          ? 'bg-[var(--accent-subtle)] text-[var(--accent)]'
          : 'text-white/40 hover:bg-white/[0.03] hover:text-white/60'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

/** Main content column — same structure as ContentPanel (h-14 header + scroll). */
export function SettingsContent() {
  const tab = tabFromRoute(useRoute());

  // Esc returns to the workspace, matching the old modal's dismiss.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') goBack(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden min-h-0">
      <div className="h-16 px-8 flex items-center border-b border-black-800 shrink-0">
        <span className="text-white/80 text-sm font-medium font-sans">{SECTION_LABEL[tab]}</span>
      </div>
      <div className="flex-1 overflow-y-auto px-8 py-7">
        <div className="max-w-xl">
          <SectionContent tab={tab} />
        </div>
      </div>
    </div>
  );
}

function SectionContent({ tab }: { tab: SettingsTab }) {
  switch (tab) {
    case 'appearance': return <AppearanceTab />;
    case 'sync': return <SyncTab />;
    case 'backup': return <BackupTab />;
    case 'plan': return <PlanTab />;
    case 'transactions': return <TransactionsTab />;
    case 'account': return <AccountTab />;
  }
}

// Backup groups the two "save & restore your workspace" surfaces: automatic
// version history and manual export/import. (History needs sign-in; export/
// import works locally too — each section handles its own auth state.)
function BackupTab() {
  return (
    <div className="flex flex-col gap-9">
      {/* Export/Import first: short & fixed. Version history last: it grows
          unboundedly, so keep it at the bottom instead of pushing everything
          else down. */}
      <DataTab />
      <HistoryTab />
    </div>
  );
}

// --- Appearance Tab ---

const HUE_GRADIENT =
  "linear-gradient(to right, hsl(0 85% 56%), hsl(60 85% 56%), hsl(120 85% 56%), hsl(180 85% 56%), hsl(240 85% 56%), hsl(300 85% 56%), hsl(360 85% 56%))";

function HueSlider({ value, onChange }: { value: number; onChange: (h: number) => void }) {
  return (
    <SliderPrimitive.Root
      min={0}
      max={360}
      step={1}
      value={[value]}
      onValueChange={(v) => onChange(v[0])}
      className="relative flex h-5 w-full grow touch-none select-none items-center"
    >
      <SliderPrimitive.Track
        className="relative h-3 w-full grow rounded-full"
        style={{ background: HUE_GRADIENT }}
      />
      <SliderPrimitive.Thumb
        aria-label="Hue"
        className="block h-4 w-4 rounded-full border-2 border-white bg-[var(--accent)] shadow outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-[var(--accent-subtle)]"
      />
    </SliderPrimitive.Root>
  );
}

// Appearance = theme (accent + colour) and layout (list/grid, density), merged
// into one surface since they're all "how the workspace looks".
function AppearanceTab() {
  const {
    hue, setHue, intensity, setIntensity, radius, setRadius,
    fontFamily, setFontFamily, uiScale, setUiScale,
    groupLayout, setGroupLayout, gridColumns, setGridColumns, density, setDensity,
    reduceMotion, setReduceMotion, resetAppearance,
  } = useSettingsStore();

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-7">
        <GroupHeading>Theme</GroupHeading>
        <SettingRow label="Accent hue" description="The colour for accents and highlights.">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <HueSlider value={hue} onChange={setHue} />
              <span className="w-10 shrink-0 rounded-md border border-white/10 py-0.5 text-center text-xs font-sans text-white/45">{hue}°</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {HUE_PRESETS.map(p => (
                <button
                  key={p.hue}
                  onClick={() => setHue(p.hue)}
                  className={`h-5 w-5 rounded-full border transition-all ${hue === p.hue ? 'border-white/70 scale-110' : 'border-transparent hover:border-white/40'}`}
                  style={{ backgroundColor: `hsl(${p.hue} 85% 56%)` }}
                  title={p.label}
                />
              ))}
            </div>
          </div>
        </SettingRow>

        <SettingRow label="Colour intensity" description="How much colour shows. 0 = neutral grayscale; higher = vivid accent + tinted surfaces.">
          <div className="flex items-center gap-3">
            <Slider min={0} max={100} value={[intensity]} onValueChange={(v) => setIntensity(v[0])} className="flex-1" />
            <span className="text-white/30 text-xs font-sans w-9 text-right shrink-0">{intensity}%</span>
          </div>
        </SettingRow>

        <SettingRow label="Roundness" description="Corner radius across the UI. 0 = sharp, higher = softer.">
          <div className="flex items-center gap-3">
            <Slider min={0} max={16} value={[radius]} onValueChange={(v) => setRadius(v[0])} className="flex-1" />
            <span className="text-white/30 text-xs font-sans w-9 text-right shrink-0">{radius}px</span>
          </div>
        </SettingRow>
      </section>

      <section className="flex flex-col gap-7">
        <GroupHeading>Display</GroupHeading>
        <SettingRow label="Font" description="The typeface used across the app.">
          <ToggleGroup<FontKey>
            value={fontFamily}
            onChange={setFontFamily}
            options={FONT_OPTIONS.map(f => ({ value: f.key, label: f.label }))}
          />
        </SettingRow>

        <SettingRow label="Interface scale" description="Zoom the whole UI in or out.">
          <div className="flex items-center gap-3">
            <Slider min={0.8} max={1.2} step={0.05} value={[uiScale]} onValueChange={(v) => setUiScale(v[0])} className="flex-1" />
            <span className="text-white/30 text-xs font-sans w-9 text-right shrink-0">{Math.round(uiScale * 100)}%</span>
          </div>
        </SettingRow>
      </section>

      <section className="flex flex-col gap-7">
        <GroupHeading>Layout</GroupHeading>
        <SettingRow label="Group layout" description="How saved tab groups are displayed.">
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
          <SettingRow label="Grid columns" description="Number of columns in grid view.">
            <ToggleGroup<string>
              value={String(gridColumns)}
              onChange={(v) => setGridColumns(Number(v))}
              options={[
                { value: '2', label: '2' },
                { value: '3', label: '3' },
                { value: '4', label: '4' },
                { value: '5', label: '5' },
                { value: '6', label: '6' },
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
              { value: 'cozy', label: 'Cozy' },
              { value: 'comfortable', label: 'Comfortable' },
            ]}
          />
        </SettingRow>
      </section>

      <section className="flex flex-col gap-7">
        <GroupHeading>Motion</GroupHeading>
        <SettingRow label="Reduce motion" description="Minimise animations and transitions across the app.">
          <div className="flex items-center gap-2">
            <Switch checked={reduceMotion} onCheckedChange={setReduceMotion} />
            <span className="text-white/60 text-sm font-sans">{reduceMotion ? 'On' : 'Off'}</span>
          </div>
        </SettingRow>
      </section>

      <div className="pt-2 border-t border-white/5">
        <Button variant="ghost" size="sm" onClick={resetAppearance} className="!text-white/45 hover:!text-white/80">
          Reset to defaults
        </Button>
      </div>
    </div>
  );
}

/** Small uppercase section heading used to group settings within a tab. */
function GroupHeading({ children }: { children: React.ReactNode }) {
  return <div className="text-white/35 text-[11px] font-medium font-sans uppercase tracking-wider">{children}</div>;
}

// --- Account Tab ---

// Providers that can be linked from the Account tab. Add a row here (+ BE config)
// to expose a new one.
const LINKABLE_PROVIDERS: { id: string; label: string }[] = [
  { id: 'google', label: 'Google' },
  { id: 'github', label: 'GitHub' },
];

function AccountTab() {
  const { user, logout, fetchUser } = useAuthStore();

  // Display name
  const [name, setName] = useState(user?.name ?? '');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  useEffect(() => { setName(user?.name ?? ''); }, [user?.name]);

  // Linked sign-in methods
  const [identities, setIdentities] = useState<LinkedIdentity[] | null>(null);
  const [hasPassword, setHasPassword] = useState<boolean>(!!user?.has_password);
  const [linking, setLinking] = useState<string | null>(null);
  const [unlinking, setUnlinking] = useState<string | null>(null);
  const [idError, setIdError] = useState('');
  const [availableProviders, setAvailableProviders] = useState<string[] | null>(null);
  useEffect(() => { apiGetAuthProviders().then(setAvailableProviders).catch(() => setAvailableProviders([])); }, []);

  const loadIdentities = () => {
    apiListIdentities()
      .then(r => { setIdentities(r.identities); setHasPassword(r.has_password); })
      .catch(() => setIdentities([]));
  };
  useEffect(loadIdentities, []);

  // A provider-link (bind) OAuth round-trip finishes in a separate tab; the
  // background writes a result flag — refresh the list + surface any error.
  useEffect(() => {
    const onChange = (changes: { [k: string]: chrome.storage.StorageChange }, area: string) => {
      if (area !== 'local' || !changes['flextab_bind_result']?.newValue) return;
      const v = changes['flextab_bind_result'].newValue as { error?: string | null };
      setIdError(v.error === 'taken' ? 'That account is already linked to a different FlexTab account.' : v.error ? 'Linking failed.' : '');
      setLinking(null);
      loadIdentities();
      try { void chrome.storage.local.remove('flextab_bind_result'); } catch (_) { /* ok */ }
    };
    try { chrome.storage?.onChanged?.addListener(onChange); } catch (_) { /* ok */ }
    return () => { try { chrome.storage?.onChanged?.removeListener(onChange); } catch (_) { /* ok */ } };
  }, []);

  const handleSaveName = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === user?.name) return;
    setNameSaving(true);
    try {
      await apiUpdateProfile(trimmed);
      await fetchUser();
      setNameSaved(true);
      setTimeout(() => setNameSaved(false), 2000);
    } catch (_) { /* leave the field for a retry */ } finally {
      setNameSaving(false);
    }
  };

  const handleLink = async (provider: string) => {
    setLinking(provider);
    setIdError('');
    try {
      chrome.tabs.create({ url: await apiGetBindUrl(provider) });
      // Completion (or error) arrives via the bind-result storage listener.
    } catch (_) {
      setLinking(null);
      setIdError("Couldn't start linking.");
    }
  };

  const handleUnlink = async (provider: string) => {
    setUnlinking(provider);
    setIdError('');
    try {
      await apiUnbindIdentity(provider);
      loadIdentities();
    } catch (err) {
      setIdError(err instanceof ApiError && err.status === 409
        ? "Can't unlink your only sign-in method — set a password or link another provider first."
        : "Couldn't unlink that provider.");
    } finally {
      setUnlinking(null);
    }
  };

  const linkedProviders = new Set((identities ?? []).map(i => i.provider));
  // Only offer to link providers the server has configured and aren't linked yet.
  const unlinkable = LINKABLE_PROVIDERS.filter(p => !linkedProviders.has(p.id) && availableProviders?.includes(p.id));

  // --- Password ---
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
    if (newPw.length < 8) { setPwError('Password must be at least 8 characters'); return; }
    if (newPw !== confirmPw) { setPwError('Passwords do not match'); return; }
    setPwLoading(true);
    try {
      await apiChangePassword(currentPw, newPw);
      setPwSuccess('Password updated');
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      loadIdentities(); // reflects newly-set password (enables unlinking the last provider)
    } catch (err: unknown) {
      setPwError(err instanceof Error ? err.message : 'Failed to update password');
    } finally {
      setPwLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-7">
      {/* Profile */}
      <SettingRow label="Profile" description="Your FlexTab account.">
        {user && (
          <div className="flex items-center gap-3">
            {user.avatar ? (
              <img src={user.avatar} alt={user.name} className="w-9 h-9 rounded-full" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-white/85 text-sm font-medium" style={{ backgroundColor: 'var(--accent)' }}>
                {(user.name || user.email).slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="flex flex-col min-w-0">
              <span className="text-white/80 text-sm font-sans truncate">{user.name}</span>
              <span className="text-white/30 text-xs font-sans truncate">{user.email}</span>
            </div>
          </div>
        )}
      </SettingRow>

      {/* Display name */}
      <SettingRow label="Display name" description="Shown across FlexTab. Independent of your provider.">
        <div className="flex items-center gap-2">
          <Input value={name} onChange={e => setName(e.target.value)} maxLength={100} placeholder="Your name" className="flex-1" />
          <Button variant="secondary" size="sm" onClick={handleSaveName} disabled={nameSaving || !name.trim() || name.trim() === user?.name}>
            {nameSaving ? 'Saving…' : nameSaved ? 'Saved' : 'Save'}
          </Button>
        </div>
      </SettingRow>

      {/* Sign-in methods */}
      <SettingRow label="Sign-in methods" description="Providers linked to your account. Link more or remove ones you don't use.">
        <div className="flex flex-col gap-2">
          {idError && <div className="text-red-400 text-xs font-sans">{idError}</div>}
          {identities === null && <div className="text-white/30 text-xs font-sans">Loading…</div>}
          {identities?.map(id => (
            <div key={id.provider} className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.08] bg-white/[0.02] px-4 py-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-white/75 text-sm font-sans capitalize">{id.provider}</span>
                {id.email && <span className="text-white/30 text-xs font-sans truncate">{id.email}</span>}
              </div>
              <Button variant="ghost" size="sm" onClick={() => handleUnlink(id.provider)} disabled={unlinking === id.provider} className="!text-red-400/70 hover:!text-red-400">
                {unlinking === id.provider ? 'Unlinking…' : 'Unlink'}
              </Button>
            </div>
          ))}
          {identities && unlinkable.map(p => (
            <Button key={p.id} variant="secondary" size="sm" onClick={() => handleLink(p.id)} disabled={linking === p.id} className="self-start">
              {linking === p.id ? 'Opening…' : `Link ${p.label}`}
            </Button>
          ))}
        </div>
      </SettingRow>

      {/* Password */}
      <SettingRow
        label={hasPassword ? 'Change password' : 'Set password'}
        description={hasPassword ? 'Update your account password.' : 'Add a password so you can also sign in with email.'}
      >
        <form onSubmit={handleChangePassword} className="flex flex-col gap-2.5">
          {!hasPassword && (
            <p className="text-white/30 text-xs leading-relaxed">
              Adding a password lets you sign in with {user?.email ?? 'your email'} too — your linked providers keep working.
            </p>
          )}
          {hasPassword && (
            <Input type="password" placeholder="Current password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} className="w-full" />
          )}
          <Input type="password" placeholder="New password" value={newPw} onChange={e => setNewPw(e.target.value)} className="w-full" minLength={8} required />
          <Input type="password" placeholder="Confirm new password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} className="w-full" minLength={8} required />
          {pwError && <div className="text-red-400 text-xs">{pwError}</div>}
          {pwSuccess && <div className="text-green-400 text-xs">{pwSuccess}</div>}
          <Button variant="default" size="sm" type="submit" disabled={pwLoading} className="self-start">
            {pwLoading ? 'Saving…' : hasPassword ? 'Update password' : 'Set password'}
          </Button>
        </form>
      </SettingRow>

      {/* Sign out */}
      <div className="pt-2 border-t border-white/5">
        <Button variant="link" onClick={logout} className="!text-sm !text-red-400/70 hover:!text-red-400">
          Sign out
        </Button>
      </div>
    </div>
  );
}

// --- Data Tab ---

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
        // Validated — defer the destructive replace until the user confirms.
        setPendingImport(data);
      } catch (err) {
        setImportStatus({ type: 'error', message: err instanceof Error ? err.message : 'Failed to import' });
      }
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
          yjs.setSpaces(pendingImport);
          setImportStatus({ type: 'success', message: `Imported ${pendingImport.length} space${pendingImport.length !== 1 ? 's' : ''}` });
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
            <div className={`text-xs font-sans ${importStatus.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
              {importStatus.message}
            </div>
          )}
        </div>
      </SettingRow>
    </div>
  );
}

// --- Sync Tab ---

function SyncTab() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const { autoSync, setAutoSync } = useSettingsStore();
  const status = useSyncStore(s => s.status);
  const lastSyncedAt = useSyncStore(s => s.lastSyncedAt);
  const [syncing, setSyncing] = useState(false);
  const [devicesNonce, setDevicesNonce] = useState(0);

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col gap-7">
        <SettingRow label="Sync" description="Sync your spaces, groups, and tabs across every device.">
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-5 py-4 text-white/50 text-sm font-sans leading-relaxed">
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
    <div className="flex flex-col gap-7">
      <SettingRow label="Status" description="Realtime connection with your account.">
        <div className="flex items-center justify-between rounded-lg border border-white/[0.08] bg-white/[0.02] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span
              className={`w-2 h-2 rounded-full ${meta.pulse ? 'animate-pulse' : ''}`}
              style={{ backgroundColor: meta.color }}
            />
            <div className="flex flex-col">
              <span className="text-white/80 text-sm font-sans font-medium">{meta.label}</span>
              <span className="text-white/30 text-xs font-sans">Last synced {formatRelativeTime(lastSyncedAt)}</span>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleSyncNow} disabled={syncing || status === 'syncing'}>
            {syncing || status === 'syncing' ? 'Syncing…' : 'Sync now'}
          </Button>
        </div>
      </SettingRow>

      <SettingRow label="Auto-sync" description="Keep changes in sync across devices automatically. When off, use “Sync now”.">
        <div className="flex items-center gap-2">
          <Switch checked={autoSync} onCheckedChange={setAutoSync} />
          <span className="text-white/60 text-sm font-sans">{autoSync ? 'On' : 'Off'}</span>
        </div>
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
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-col gap-2">
          {failed && <div className="text-white/30 text-xs font-sans">Couldn't load devices.</div>}
          {!failed && devices === null && <div className="text-white/30 text-xs font-sans">Loading…</div>}
          {!failed && devices?.length === 0 && <div className="text-white/30 text-xs font-sans">No devices recorded yet.</div>}
          {devices?.map(d => (
            <div key={d.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.08] bg-white/[0.02] px-4 py-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-white/75 text-sm font-sans truncate">{d.label}</span>
                {d.id === thisDeviceId && (
                  <Badge variant="accent" size="sm" className="shrink-0 font-normal">This device</Badge>
                )}
              </div>
              <span className="text-white/30 text-xs font-sans shrink-0 tabular-nums">
                {formatRelativeTime(new Date(d.last_seen_at).getTime())}
              </span>
            </div>
          ))}
        </div>
        {lastSyncedDevice && (
          <div className="text-white/30 text-xs font-sans px-0.5">
            Last synced from <span className="text-white/50">{lastSyncedDevice.label}</span> · {formatRelativeTime(new Date(lastSyncedDevice.last_synced_at!).getTime())}
          </div>
        )}
      </div>
    </SettingRow>
  );
}

// --- History Tab (version snapshots) ---

function HistoryTab() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const [snapshots, setSnapshots] = useState<SnapshotInfo[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [previewing, setPreviewing] = useState<number | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [done, setDone] = useState(false);

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

  const handleRestore = async (revision: number) => {
    setRestoring(true);
    try {
      await apiRestoreSnapshot(revision);
      await pullAndOverwrite(); // server is authoritative after a restore
      setDone(true);
      setConfirming(null);
      setPreviewing(null);
      load();
      setTimeout(() => setDone(false), 2500);
    } finally {
      setRestoring(false);
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
          {done && <div className="text-xs font-sans" style={{ color: 'var(--accent)' }}>Restored.</div>}
          {snapshots?.map(s => (
            <SnapshotRow
              key={s.revision}
              snapshot={s}
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

function SnapshotRow({ snapshot, onPreview, onRestore }: {
  snapshot: SnapshotInfo;
  onPreview: () => void;
  onRestore: () => void;
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
        <Button variant="ghost" size="sm" onClick={onRestore}>Restore</Button>
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

function SnapshotPreviewModal({ snapshot, open, onOpenChange, onRestore }: {
  snapshot: SnapshotInfo;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRestore: () => void;
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
          <Button variant="default" size="sm" onClick={onRestore}>Restore this version</Button>
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

function HistoryIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v5h5" />
      <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
      <path d="M12 7v5l4 2" />
    </svg>
  );
}

function ReceiptIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 3h16v18l-3-2-3 2-3-2-3 2-3-2-1 2Z" />
      <path d="M8 8h8M8 12h8M8 16h4" />
    </svg>
  );
}

// --- Shared Components ---

// --- Plan & Usage Tab ---

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * One "used / cap" row with a progress bar. cap of 0 = unlimited.
 *
 * tone:
 *  - "quota" (default) — filling up is bad (blocks new tabs / sync); goes
 *    amber near the cap, red when full.
 *  - "rolling" — a rolling window that auto-trims the oldest at the cap (e.g.
 *    version history); sitting at 100% is normal, so it stays accent-colored.
 */
function UsageBar({ label, used, cap, format, tone = 'quota', hint }: {
  label: string; used: number; cap: number;
  format?: (n: number) => string; tone?: 'quota' | 'rolling'; hint?: string;
}) {
  const fmt = format ?? ((n: number) => String(n));
  const unlimited = cap === 0;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / cap) * 100));
  const near = !unlimited && pct >= 80;
  const full = !unlimited && used >= cap;
  const barColor = tone === 'rolling'
    ? 'var(--accent)'
    : full ? '#f87171' : near ? '#fbbf24' : 'var(--accent)';

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-white/60 text-xs font-sans">{label}</span>
        <span className="text-white/40 text-xs font-sans tabular-nums">
          {fmt(used)} {unlimited ? <span className="text-white/25">/ ∞</span> : <span className="text-white/25">/ {fmt(cap)}</span>}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        {!unlimited && (
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: barColor }} />
        )}
      </div>
      {hint && <span className="text-white/25 text-[11px] font-sans">{hint}</span>}
    </div>
  );
}

// Display prices only — informational. The actual charge is entirely
// provider/server-determined (see billing.IPaymu/LemonSqueezy.CheckoutURL);
// nothing here is trusted or sent to the backend. IDR since iPaymu is the
// live provider today; update alongside IPAYMU_*_PRICE_IDR if those change.
const PLAN_PRICE_IDR: Record<'plus' | 'pro', number> = { plus: 59000, pro: 99000 };

function formatIDR(n: number): string {
  return `Rp${n.toLocaleString('id-ID')}`;
}

// Poll delays (ms) after a checkout success signal, before the plan is
// confirmed to have changed — increasing backoff, ~34s total coverage. Real
// webhook delivery is typically a couple seconds, but this needs to survive
// slower deliveries without the user having to manually refresh the tab.
const CONFIRM_POLL_DELAYS = [0, 2000, 3000, 5000, 8000, 12000, 4000];

function PlanTab() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const [status, setStatus] = useState<PlanStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [upgradingPlan, setUpgradingPlan] = useState<'plus' | 'pro' | null>(null);
  const [upgradeError, setUpgradeError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const planRef = useRef<string | undefined>(undefined);

  const refetchBilling = () => {
    apiGetBillingStatus().then(setBilling).catch(() => { /* no billing card */ });
    apiGetPlan().then(s => { setStatus(s); planRef.current = s.plan; setFailed(false); }).catch(() => setFailed(true));
  };

  const handleUpgrade = async (targetPlan: 'plus' | 'pro') => {
    setUpgradingPlan(targetPlan);
    setUpgradeError('');
    try {
      const url = await apiGetCheckoutUrl(targetPlan);
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) {
        setUpgradeError('Upgrades aren’t available yet during the beta.');
      } else if (err instanceof ApiError && err.status === 409) {
        setUpgradeError('This account already has an active subscription.');
      } else if (err instanceof ApiError && err.status === 400) {
        setUpgradeError('That plan isn’t available for purchase yet.');
      } else {
        setUpgradeError('Couldn’t start the upgrade. Try again in a moment.');
      }
    } finally {
      setUpgradingPlan(null);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;
    apiGetPlan()
      .then(s => { if (active) { setStatus(s); planRef.current = s.plan; setFailed(false); } })
      .catch(() => { if (active) setFailed(true); });
    // Billing details (renewal, card, portal) — absent for free and comped-Pro
    // accounts, so a failure here just hides the billing card.
    apiGetBillingStatus()
      .then(b => { if (active) setBilling(b); })
      .catch(() => { /* no billing card */ });
    return () => { active = false; };
  }, [isAuthenticated]);

  // The webhook that actually grants the plan lands asynchronously after the
  // checkout tab closes (background.ts stashes the outcome — see the
  // trust-boundary note there and in newtab/index.tsx's toast). Poll with
  // backoff until the resolved plan actually differs from what it was before
  // checkout, rather than a couple of fixed-delay guesses — a webhook that
  // lands late (retry, slow delivery) would otherwise leave the tab showing
  // the old plan until the user manually refreshes.
  useEffect(() => {
    if (!isAuthenticated) return;
    const KEY = 'flextab_billing_result';
    let cancelled = false;

    const poll = (attempt: number, baselinePlan: string | undefined) => {
      if (cancelled) return;
      apiGetPlan()
        .then(s => {
          if (cancelled) return;
          setStatus(s);
          planRef.current = s.plan;
          setFailed(false);
          if (s.plan !== baselinePlan) {
            setConfirming(false);
            apiGetBillingStatus().then(b => { if (!cancelled) setBilling(b); }).catch(() => { /* ok */ });
            return;
          }
          scheduleNext(attempt, baselinePlan);
        })
        .catch(() => scheduleNext(attempt, baselinePlan));
    };
    const scheduleNext = (attempt: number, baselinePlan: string | undefined) => {
      const next = attempt + 1;
      if (next >= CONFIRM_POLL_DELAYS.length) { setConfirming(false); return; }
      setTimeout(() => poll(next, baselinePlan), CONFIRM_POLL_DELAYS[next]);
    };

    const onResult = (result: unknown) => {
      if (result && typeof result === 'object' && (result as { outcome?: unknown }).outcome === 'success') {
        setConfirming(true);
        poll(0, planRef.current);
      }
    };
    try { chrome.storage.local.get(KEY).then(r => onResult(r[KEY])); } catch (_) { /* ok */ }
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes[KEY]?.newValue) onResult(changes[KEY].newValue);
    };
    try { chrome.storage.onChanged.addListener(listener); } catch (_) { /* ok */ }
    return () => {
      cancelled = true;
      try { chrome.storage.onChanged.removeListener(listener); } catch (_) { /* ok */ }
    };
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col gap-7">
        <SettingRow label="Plan & Usage" description="Your plan limits and how much you've used.">
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-5 py-4 text-white/50 text-sm font-sans leading-relaxed">
            Sign in to see your plan and usage. Local-only workspaces have no limits.
          </div>
        </SettingRow>
      </div>
    );
  }

  const currentPlan = status?.plan ?? 'free';

  return (
    <div className="flex flex-col gap-7">
      <SettingRow label="Plan" description="FlexTab is in beta — limits are generous while we're in preview.">
        <div className="grid grid-cols-3 gap-2.5">
          <PlanCard
            name="Free" price="Free" active={currentPlan === 'free'}
            limits={status?.limits}
          />
          <PlanCard
            name="Plus" price={formatIDR(PLAN_PRICE_IDR.plus) + '/mo'} active={currentPlan === 'plus'}
            limits={status?.plus_limits}
            onUpgrade={currentPlan === 'free' ? () => handleUpgrade('plus') : undefined}
            upgrading={upgradingPlan === 'plus'}
          />
          <PlanCard
            name="Pro" price={formatIDR(PLAN_PRICE_IDR.pro) + '/mo'} active={currentPlan === 'pro'}
            limits={status?.pro_limits}
            onUpgrade={currentPlan !== 'pro' ? () => handleUpgrade('pro') : undefined}
            upgrading={upgradingPlan === 'pro'}
          />
        </div>
        {upgradeError && <div className="text-amber-300/80 text-xs font-sans mt-1.5">{upgradeError}</div>}
        {confirming && <div className="text-white/40 text-xs font-sans mt-1.5">Confirming your payment — this can take a few seconds…</div>}
      </SettingRow>

      {billing?.active && (
        <SettingRow label="Billing" description="Your subscription, managed by our payment provider.">
          <div className="flex items-center justify-between rounded-lg border border-white/[0.08] bg-white/[0.02] px-5 py-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-white/70 text-sm font-sans">
                {billing.status === 'cancelled' && billing.ends_at
                  ? `${currentPlan === 'plus' ? 'Plus' : 'Pro'} until ${formatDate(billing.ends_at)} — won't renew`
                  : billing.renews_at
                    ? `Renews on ${formatDate(billing.renews_at)}`
                    : 'Active subscription'}
              </span>
              {billing.card_brand && billing.card_last_four && (
                <span className="text-white/35 text-xs font-sans capitalize">
                  {billing.card_brand} •••• {billing.card_last_four}
                </span>
              )}
            </div>
            {billing.portal_url && (
              <Button variant="secondary" size="sm" onClick={() => window.open(billing.portal_url, '_blank', 'noopener')}>
                Manage billing
              </Button>
            )}
          </div>
        </SettingRow>
      )}

      <SettingRow label="Usage" description="How much of your plan you're using across this account.">
        {failed && <div className="text-white/30 text-xs font-sans">Couldn't load usage.</div>}
        {!failed && !status && <div className="text-white/30 text-xs font-sans">Loading…</div>}
        {status && (
          <div className="flex flex-col gap-3">
            <UsageBar label="Total tabs" used={status.usage.total_tabs} cap={status.limits.max_tabs_total} />
            <UsageBar label="Storage" used={status.usage.tree_bytes} cap={status.limits.max_tree_bytes} format={formatBytes} />
            <UsageBar label="Version history" used={status.usage.snapshots} cap={status.limits.max_snapshots} tone="rolling" hint="Restore points kept — the oldest drop off automatically." />
          </div>
        )}
      </SettingRow>
    </div>
  );
}

/** One tier card in the Plan row: name, price, limits, and (if upgradable) a buy button. */
function PlanCard({ name, price, active, limits, onUpgrade, upgrading }: {
  name: string; price: string; active: boolean; limits?: PlanLimits;
  onUpgrade?: () => void; upgrading?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-2.5 rounded-lg border px-4 py-3.5 ${active ? 'border-accent/40 bg-accent/[0.06]' : 'border-white/[0.08] bg-white/[0.02]'}`}>
      <div className="flex items-center gap-1.5">
        <span className="text-white/80 text-sm font-sans font-medium">{name}</span>
        {active && <Badge variant="accent" size="sm" className="font-normal">Current</Badge>}
      </div>
      <span className="text-white/50 text-xs font-sans">{price}</span>
      {limits && (
        <div className="flex flex-col gap-1 text-[11px] font-sans text-white/40">
          <span>{limits.max_tabs_total === 0 ? 'Unlimited tabs' : `${limits.max_tabs_total.toLocaleString()} tabs`}</span>
          <span>{limits.max_tree_bytes === 0 ? 'Unlimited storage' : formatBytes(limits.max_tree_bytes)}</span>
          <span>{limits.max_snapshots === 0 ? 'Unlimited history' : `${limits.max_snapshots} versions of history`}</span>
        </div>
      )}
      {onUpgrade && (
        <Button variant={active ? 'secondary' : 'default'} size="sm" onClick={onUpgrade} disabled={upgrading} className="mt-1">
          {upgrading ? 'Opening…' : `Upgrade to ${name}`}
        </Button>
      )}
    </div>
  );
}

// --- Transactions Tab ---

const TXN_TYPE_LABEL: Record<string, string> = { created: 'Purchase', updated: 'Renewal', cancelled: 'Cancellation' };

function TransactionsTab() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const [txns, setTxns] = useState<Transaction[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;
    apiGetTransactions()
      .then(t => { if (active) { setTxns(t); setFailed(false); } })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col gap-7">
        <SettingRow label="Transactions" description="Your billing history.">
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-5 py-4 text-white/50 text-sm font-sans leading-relaxed">
            Sign in to see your billing history.
          </div>
        </SettingRow>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-7">
      <SettingRow label="Transactions" description="Every purchase, renewal, and cancellation on this account.">
        {failed && <div className="text-white/30 text-xs font-sans">Couldn't load transaction history.</div>}
        {!failed && !txns && <div className="text-white/30 text-xs font-sans">Loading…</div>}
        {txns && txns.length === 0 && <div className="text-white/30 text-xs font-sans">No transactions yet.</div>}
        {txns && txns.length > 0 && (
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] divide-y divide-white/[0.06]">
            {txns.map(t => (
              <div key={t.id} className="flex items-center justify-between px-5 py-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-white/70 text-sm font-sans">
                    {TXN_TYPE_LABEL[t.type] ?? t.type} — {t.plan === 'plus' ? 'Plus' : 'Pro'}
                  </span>
                  <span className="text-white/35 text-xs font-sans capitalize">
                    {formatDate(t.created_at)} · via {t.provider} · {t.status}
                  </span>
                </div>
                <span className="text-white/60 text-sm font-sans tabular-nums">
                  {t.amount_idr > 0 ? formatIDR(t.amount_idr) : '—'}
                </span>
              </div>
            ))}
          </div>
        )}
      </SettingRow>
    </div>
  );
}

// Settings row: label + description, then the control full-width below. Stacked
// (not two-column) so it works uniformly for everything — sliders, toggles, and
// the wide content rows (device/snapshot lists, usage bars, forms) alike — with
// no floating controls, squished lists, or label/control height mismatch. Rows
// are separated by the parent's gap.
function SettingRow({ label, description, children }: { label: string; description: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div>
        <div className="text-white/80 font-sans text-sm font-medium">{label}</div>
        <div className="text-white/35 font-sans text-xs mt-0.5 leading-relaxed">{description}</div>
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
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-sans transition-colors border ${
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

function PlanIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
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
