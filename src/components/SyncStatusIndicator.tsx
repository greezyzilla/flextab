import { Cloud, CloudOff, RefreshCw } from "lucide-react";
import { useSyncStore, formatRelativeTime } from "~src/store/useSyncStore";
import { useAuthStore } from "~src/store/useAuthStore";
import { Tooltip, TooltipTrigger, TooltipContent } from "./ui/tooltip";

type View = { Icon: typeof Cloud; cls: string; label: string; spin?: boolean };

/**
 * Connection status in the top header. Icon (matches the header toggles) tinted by
 * realtime sync state — reassures that offline still works (changes saved locally).
 * A small amber dot flags pending local edits that aren't on the server yet, but
 * only when we're not actively syncing them (auto-sync off / offline / error) —
 * while online the background push flushes within seconds, so a dot there is noise.
 */
export function SyncStatusIndicator() {
  const status = useSyncStore((s) => s.status);
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);
  const dirty = useSyncStore((s) => s.dirty);
  const conflictPending = useSyncStore((s) => s.conflictPending);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  let v: View;
  if (!isAuthenticated) {
    // No account at all — visually distinct from "signed in, auto-sync off"
    // (which keeps the Cloud icon) so the two aren't confused.
    v = { Icon: CloudOff, cls: "text-white/25", label: "Local only" };
  } else {
    switch (status) {
      case "online":     v = { Icon: Cloud, cls: "text-white/45", label: "Connected" }; break;
      case "connecting": v = { Icon: RefreshCw, cls: "text-white/55", label: "Connecting…", spin: true }; break;
      case "syncing":    v = { Icon: RefreshCw, cls: "text-white/55", label: "Syncing…", spin: true }; break;
      case "offline":    v = { Icon: CloudOff, cls: "text-white/35", label: "Offline" }; break;
      case "error":      v = { Icon: CloudOff, cls: "text-red-400/70", label: "Sync error" }; break;
      default:           v = { Icon: Cloud, cls: "text-white/35", label: "Auto-sync off" }; break;
    }
  }

  const offline = isAuthenticated && (status === "offline" || status === "error");
  // Only flag pending state when we're not actively syncing (online / connecting
  // / syncing converge on their own — a dot there is just noise).
  const idle = status === "paused" || status === "offline" || status === "error";
  // An abandoned merge conflict outranks ordinary unsynced edits: it needs a
  // decision, not just a push. Red dot; the amber "unsynced" dot covers the rest.
  const showConflict = isAuthenticated && conflictPending && idle;
  const showDirty = isAuthenticated && dirty && idle && !showConflict;
  const label = showConflict ? "Sync conflict" : v.label;

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
        <div className="text-white/45">
          {!isAuthenticated
            ? "Not synced to an account"
            : showConflict
              ? "Turn on sync to resolve the conflict"
              : showDirty
                ? status === "paused"
                  ? "Unsynced changes — turn on sync or use Sync now"
                  : "Unsynced changes — will sync when reconnected"
                : offline
                  ? "Changes saved locally"
                  : formatRelativeTime(lastSyncedAt)}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
