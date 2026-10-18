import { toast } from "sonner";
import { useState, useEffect, useMemo } from "react";
import { useSettingsStore } from "~src/store/useSettingsStore";
import { useAuthStore } from "~src/store/useAuthStore";
import { useSyncStore, SYNC_STATUS_META, formatRelativeTime } from "~src/store/useSyncStore";
import { getDeviceId } from "~src/services/api";
import { apiGetDevices, type DeviceInfo } from "~src/services/device";
import { syncNow } from "~src/services/syncEngine";
import { Switch } from "~src/components/ui/switch";
import { Button } from "~src/components/ui/button";
import { Badge } from "~src/components/ui/badge";
import { Card } from "~src/components/ui/card";
import { SettingRow } from "./shared";

export function SyncTab() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const guestMode = useAuthStore(s => s.guestMode);
  const { autoSync, setAutoSync } = useSettingsStore();
  const status = useSyncStore(s => s.status);
  const lastSyncedAt = useSyncStore(s => s.lastSyncedAt);
  const [syncing, setSyncing] = useState(false);
  const [devicesNonce, setDevicesNonce] = useState(0);

  // No account → local-only workspace (not "offline"). Offline is a signed-in
  // transport state shown only after authentication below.
  if (!isAuthenticated) {
    return (
      <div className="flex flex-col gap-7">
        <SettingRow
          label="Sync"
          description={
            guestMode
              ? "Guest mode: everything stays on this device until you sign in."
              : "Sync your spaces, groups, and tabs across every device."
          }
        >
          <Card className="px-5 py-4 text-white/50 text-sm font-sans leading-relaxed shadow-none">
            {guestMode
              ? "You're in guest mode — not offline. Tabs save locally on this device. Sign in to back up and sync across devices."
              : "You're using FlexTab locally on this device. Sign in to back up and sync your tabs across devices."}
          </Card>
        </SettingRow>
      </div>
    );
  }

  const meta = SYNC_STATUS_META[status];

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const result = await syncNow();
      switch (result.status) {
        case "ok": toast.success("Sync completed"); setDevicesNonce(n => n + 1); break;
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
    <div className="flex flex-col gap-7">
      <SettingRow label="Status" description="Realtime connection with your account.">
        <Card className="flex items-center justify-between px-5 py-4 shadow-none">
          <div className="flex items-center gap-2.5">
            <span
              className={`w-2 h-2 rounded-full ${meta.pulse ? "animate-pulse" : ""}`}
              style={{ backgroundColor: meta.color }}
            />
            <div className="flex flex-col">
              <span className="text-white/80 text-sm font-sans font-medium">{meta.label}</span>
              <span className="text-white/30 text-xs font-sans">Last synced {formatRelativeTime(lastSyncedAt)}</span>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleSyncNow} disabled={syncing || status === "syncing"}>
            {syncing || status === "syncing" ? "Syncing…" : "Sync now"}
          </Button>
        </Card>
      </SettingRow>

      <SettingRow label="Auto-sync" description="Keep changes in sync across devices automatically. When off, use “Sync now”.">
        {(controlProps) => (
          <div className="flex items-center gap-2">
            <Switch {...controlProps} checked={autoSync} onCheckedChange={setAutoSync} />
            <span className="text-white/60 text-sm font-sans">{autoSync ? 'On' : 'Off'}</span>
          </div>
        )}
      </SettingRow>

      <DevicesSection refresh={devicesNonce} />
    </div>
  );
}

export function DevicesSection({ refresh }: { refresh: number }) {
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

