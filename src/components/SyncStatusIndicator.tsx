import { useSyncStore, SYNC_STATUS_META, formatRelativeTime } from "~src/store/useSyncStore";
import { useAuthStore } from "~src/store/useAuthStore";
import { Tooltip, TooltipTrigger, TooltipContent } from "./ui/tooltip";

/**
 * Small always-visible connection dot. Reflects the realtime sync status for a
 * signed-in user (green = connected, amber = syncing/connecting, gray = offline,
 * red = error), or "Local only" for guests. Reassures that offline still works.
 */
export function SyncStatusIndicator() {
  const status = useSyncStore((s) => s.status);
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const meta = isAuthenticated
    ? SYNC_STATUS_META[status]
    : { label: "Local only", color: "#a3a3a3", pulse: false as boolean | undefined };

  const offline = isAuthenticated && (status === "offline" || status === "error");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex h-6 w-6 items-center justify-center" aria-label={meta.label}>
          <span
            className={`h-2 w-2 rounded-full ${meta.pulse ? "animate-pulse" : ""}`}
            style={{ backgroundColor: meta.color, boxShadow: `0 0 6px ${meta.color}66` }}
          />
        </div>
      </TooltipTrigger>
      <TooltipContent side="right">
        <div className="font-medium">{meta.label}</div>
        {isAuthenticated && (
          <div className="text-white/45">
            {offline ? "Changes saved locally" : formatRelativeTime(lastSyncedAt)}
          </div>
        )}
        {!isAuthenticated && <div className="text-white/45">Not synced to an account</div>}
      </TooltipContent>
    </Tooltip>
  );
}
