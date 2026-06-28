import { Cloud, CloudOff, RefreshCw } from "lucide-react";
import { useSyncStore, formatRelativeTime } from "~src/store/useSyncStore";
import { useAuthStore } from "~src/store/useAuthStore";
import { Tooltip, TooltipTrigger, TooltipContent } from "./ui/tooltip";

type View = { Icon: typeof Cloud; cls: string; label: string; spin?: boolean };

/**
 * Connection status in the top header. Icon (matches the header toggles) tinted by
 * realtime sync state — reassures that offline still works (changes saved locally).
 */
export function SyncStatusIndicator() {
  const status = useSyncStore((s) => s.status);
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  let v: View;
  if (!isAuthenticated) {
    v = { Icon: Cloud, cls: "text-white/30", label: "Local only" };
  } else {
    switch (status) {
      case "online":     v = { Icon: Cloud, cls: "text-white/45", label: "Connected" }; break;
      case "connecting": v = { Icon: RefreshCw, cls: "text-white/55", label: "Connecting…", spin: true }; break;
      case "syncing":    v = { Icon: RefreshCw, cls: "text-white/55", label: "Syncing…", spin: true }; break;
      case "offline":    v = { Icon: CloudOff, cls: "text-white/35", label: "Offline" }; break;
      case "error":      v = { Icon: CloudOff, cls: "text-red-400/70", label: "Sync error" }; break;
      default:           v = { Icon: Cloud, cls: "text-white/30", label: "Auto-sync off" }; break;
    }
  }

  const offline = isAuthenticated && (status === "offline" || status === "error");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex h-9 w-7 shrink-0 items-center justify-center" aria-label={v.label}>
          <v.Icon className={`h-[18px] w-[18px] ${v.cls} ${v.spin ? "animate-spin" : ""}`} strokeWidth={1.75} />
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="end">
        <div className="font-medium">{v.label}</div>
        <div className="text-white/45">
          {!isAuthenticated
            ? "Not synced to an account"
            : offline
              ? "Changes saved locally"
              : formatRelativeTime(lastSyncedAt)}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
