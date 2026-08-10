import { Cloud, CloudOff, HardDrive, RefreshCw } from "lucide-react";
import { useSyncStore, formatRelativeTime } from "~src/store/useSyncStore";
import { useAuthStore } from "~src/store/useAuthStore";
import { Tooltip, TooltipTrigger, TooltipContent } from "./ui/tooltip";

type View = { Icon: typeof Cloud; cls: string; label: string; spin?: boolean; detail: string };

/**
 * Connection status in the top header.
 *
 * Three different product states must never collapse into one icon/copy:
 * - Guest / not signed in → local device only (no account, not "offline")
 * - Signed in + connection down → Offline (will retry / reconnect)
 * - Signed in + auto-sync off → paused (Cloud, not CloudOff)
 */
export function SyncStatusIndicator() {
  const status = useSyncStore((s) => s.status);
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);
  const dirty = useSyncStore((s) => s.dirty);
  const conflictPending = useSyncStore((s) => s.conflictPending);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const guestMode = useAuthStore((s) => s.guestMode);

  let v: View;
  if (!isAuthenticated) {
    // Never use connection statuses (offline/error) here — no account means
    // there is nothing to be "offline" from. Guest vs bare local-only differ
    // only in copy; both are device-local (HardDrive ≠ CloudOff).
    v = guestMode
      ? {
          Icon: HardDrive,
          cls: "text-white/30",
          label: "Guest",
          detail: "Local only on this device — sign in anytime to sync",
        }
      : {
          Icon: HardDrive,
          cls: "text-white/25",
          label: "Local only",
          detail: "Not signed in — tabs stay on this device",
        };
  } else {
    switch (status) {
      case "online":
        v = { Icon: Cloud, cls: "text-white/45", label: "Connected", detail: formatRelativeTime(lastSyncedAt) };
        break;
      case "connecting":
        v = { Icon: RefreshCw, cls: "text-white/55", label: "Connecting…", detail: "Reaching your account…", spin: true };
        break;
      case "syncing":
        v = { Icon: RefreshCw, cls: "text-white/55", label: "Syncing…", detail: "Uploading or pulling changes…", spin: true };
        break;
      case "offline":
        // Signed-in account, transport down — not the same as guest/local-only.
        v = {
          Icon: CloudOff,
          cls: "text-white/40",
          label: "Offline",
          detail: "No connection — changes stay on this device until you reconnect",
        };
        break;
      case "error":
        v = {
          Icon: CloudOff,
          cls: "text-red-400/70",
          label: "Sync error",
          detail: "Last sync failed — changes are still saved locally",
        };
        break;
      default:
        v = {
          Icon: Cloud,
          cls: "text-white/35",
          label: "Auto-sync off",
          detail: formatRelativeTime(lastSyncedAt),
        };
        break;
    }
  }

  // Pending dots only for signed-in idle connection states (never guest).
  const idle = isAuthenticated && (status === "paused" || status === "offline" || status === "error");
  const showConflict = idle && conflictPending;
  const showDirty = idle && dirty && !showConflict;
  const label = showConflict ? "Sync conflict" : v.label;
  const detail = showConflict
    ? "Turn on sync to resolve the conflict"
    : showDirty
      ? status === "paused"
        ? "Unsynced changes — turn on sync or use Sync now"
        : "Unsynced changes — will sync when reconnected"
      : v.detail;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="relative flex h-9 w-7 shrink-0 items-center justify-center" aria-label={label}>
          <v.Icon className={`h-[18px] w-[18px] ${v.cls} ${v.spin ? "animate-spin" : ""}`} strokeWidth={1.75} />
          {(showConflict || showDirty) && (
            <span
              className={`absolute right-1 top-1.5 h-[7px] w-[7px] rounded-full ring-2 ring-black-900 ${
                showConflict ? "bg-red-500" : "bg-amber-400"
              }`}
              aria-hidden
            />
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="end">
        <div className="font-medium">{label}</div>
        <div className="text-white/45">{detail}</div>
      </TooltipContent>
    </Tooltip>
  );
}
