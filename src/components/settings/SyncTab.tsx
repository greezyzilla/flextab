import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useState, useEffect, useMemo, useRef } from "react";
import { useSettingsStore } from "~src/store/useSettingsStore";
import { useAuthStore } from "~src/store/useAuthStore";
import { useSyncStore, formatRelativeTime } from "~src/store/useSyncStore";
import { getDeviceId } from "~src/services/api";
import { apiGetDevices, type DeviceInfo } from "~src/services/device";
import { syncNow } from "~src/services/syncEngine";
import { Switch } from "~src/components/ui/switch";
import { Button } from "~src/components/ui/button";
import { Badge } from "~src/components/ui/badge";
import { DoneLine } from "~src/components/ui/done-check";
import { SettingRow, SettingsList, SettingsListRow, SettingsNotice, SettingsSection } from "./shared";

export function SyncTab() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const { autoSync, setAutoSync } = useSettingsStore();
  const status = useSyncStore(s => s.status);
  const lastSyncedAt = useSyncStore(s => s.lastSyncedAt);
  const [syncing, setSyncing] = useState(false);
  const [synced, setSynced] = useState(false);

  // No account → local-only workspace (not "offline"). The live sync state
  // lives in the header's sync indicator; Settings holds what you set.
  if (!isAuthenticated) {
    return (
      <SettingsSection title="Sync" icon={RefreshCw} subtitle="Keep your tabs the same on every device." notice={<SettingsNotice>You're using FlexTab locally on this device. Sign in to back up and sync your tabs across devices.</SettingsNotice>}>
        {null}
      </SettingsSection>
    );
  }

  const handleSyncNow = async () => {
    setSyncing(true);
    setSynced(false);
    try {
      const result = await syncNow();
      switch (result.status) {
        case "ok": setSynced(true); break; // said in the row, where Sync now was pressed (TASK-96)
        case "offline": toast.error("Could not reach the server. Your changes are saved locally."); break;
        case "conflict": toast.info("Resolve the sync conflict, then use Sync now again."); break;
        case "limit": toast.error(result.message); break;
        case "signed_out": toast.error("Sign in to sync your workspace."); break;
        default: toast.error("Sync did not complete. Your changes are saved locally. Try again.");
      }
    } catch {
      toast.error("Sync did not complete. Please try again.");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <SettingsSection title="Sync" icon={RefreshCw} subtitle="Keep your tabs the same on every device.">
      <SettingRow label="Auto-sync" description="Keep changes in sync across devices automatically. When off, use “Sync now”.">
        {(controlProps) => (
          <div className="flex items-center gap-2">
            <Switch {...controlProps} checked={autoSync} onCheckedChange={setAutoSync} />
            <span className="text-fg-muted text-sm font-sans">{autoSync ? 'On' : 'Off'}</span>
          </div>
        )}
      </SettingRow>
      <SettingRow label="Sync now" description={`Last synced ${formatRelativeTime(lastSyncedAt)}.`}>
        <Button variant="ghost" size="sm" onClick={handleSyncNow} disabled={syncing || status === "syncing"}>
          {syncing || status === "syncing" ? "Syncing…" : "Sync now"}
        </Button>
        {synced && <DoneLine>Synced.</DoneLine>}
      </SettingRow>
    </SettingsSection>
  );
}

/** Devices that have used this account (Settings › Sign-in & security). */
export function DevicesList() {
  const [devices, setDevices] = useState<DeviceInfo[] | null>(null);
  const [thisDeviceId, setThisDeviceId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const alive = useRef(true);
  const load = () => {
    setDevices(null);
    setFailed(false);
    apiGetDevices()
      .then(d => { if (alive.current) { setDevices(d); setFailed(false); } })
      .catch(() => { if (alive.current) setFailed(true); });
  };

  useEffect(() => {
    alive.current = true;
    getDeviceId().then(id => { if (alive.current) setThisDeviceId(id); });
    load();
    return () => { alive.current = false; };
  }, []);

  const lastSyncedDevice = useMemo(() => {
    if (!devices) return null;
    return devices
      .filter(d => d.last_synced_at)
      .sort((a, b) => new Date(b.last_synced_at!).getTime() - new Date(a.last_synced_at!).getTime())[0] ?? null;
  }, [devices]);

  return (
    <SettingsList
      label="Devices"
      failed={failed ? { title: "Couldn't load devices.", says: "Check your connection, then try again.", onRetry: load } : undefined}
      loading={devices === null ? { label: "Loading devices", rows: 2 } : undefined}
      empty={devices?.length === 0 ? { title: "No devices recorded yet.", says: "Each browser you sign in on shows up here." } : undefined}
    >
      {devices?.map(d => (
        <SettingsListRow
          key={d.id}
          title={<>
            <span className="truncate">{d.label}</span>
            {d.id === thisDeviceId && <Badge variant="accent" size="sm" className="shrink-0 font-normal">This device</Badge>}
          </>}
          meta={<>
            Last seen {formatRelativeTime(new Date(d.last_seen_at).getTime())}
            {lastSyncedDevice?.id === d.id && d.last_synced_at && ` · last to sync, ${formatRelativeTime(new Date(d.last_synced_at).getTime())}`}
          </>}
        />
      ))}
    </SettingsList>
  );
}
