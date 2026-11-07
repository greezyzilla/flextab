import type { LucideIcon } from "lucide-react"
import { Cloud, CloudOff, HardDrive, RefreshCw } from "lucide-react"
import { useSyncStore, formatRelativeTime } from "~src/store/useSyncStore"
import { useAuthStore } from "~src/store/useAuthStore"
import { Tooltip, TooltipTrigger, TooltipContent } from "./ui/tooltip"
import { navigate } from "~src/lib/route"
import { SIGN_IN_ROUTE } from "~src/lib/workspaceAccess"

/**
 * Header sync badge.
 *
 * Keep these product states separate:
 * - not signed in → local device only (HardDrive), never "Offline". It is
 *   also the one global way in to sign-in (TASK-7), so it is a labelled button.
 * - signed in + no transport → Offline (CloudOff)
 * - signed in + auto-sync off → paused (Cloud)
 */
export function SyncStatusIndicator() {
  const status = useSyncStore((s) => s.status)
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt)
  const dirty = useSyncStore((s) => s.dirty)
  const conflictPending = useSyncStore((s) => s.conflictPending)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  let Icon: LucideIcon = Cloud
  let cls = "text-fg-subtle"
  let label = "Auto-sync off"
  let detail = formatRelativeTime(lastSyncedAt)
  let spin = false

  if (!isAuthenticated) {
    Icon = HardDrive
    cls = "text-fg-subtle"
    label = "Local only"
    detail = "Tabs stay on this device. Sign in to sync them across devices"
  } else if (status === "online") {
    Icon = Cloud
    cls = "text-fg-subtle"
    label = "Connected"
    detail = formatRelativeTime(lastSyncedAt)
  } else if (status === "connecting") {
    Icon = RefreshCw
    cls = "text-fg-subtle"
    label = "Connecting…"
    detail = "Reaching your account…"
    spin = true
  } else if (status === "syncing") {
    Icon = RefreshCw
    cls = "text-fg-subtle"
    label = "Syncing…"
    detail = "Uploading or pulling changes…"
    spin = true
  } else if (status === "offline") {
    Icon = CloudOff
    cls = "text-fg-subtle"
    label = "Offline"
    detail = "No connection. Changes stay on this device until you reconnect"
  } else if (status === "error") {
    Icon = CloudOff
    cls = "text-red-400"
    label = "Sync error"
    detail = "Last sync failed. Changes are still saved locally"
  }

  const idle =
    isAuthenticated &&
    (status === "paused" || status === "offline" || status === "error")
  const showConflict = idle && conflictPending
  const showDirty = idle && dirty && !showConflict

  if (showConflict) {
    label = "Sync conflict"
    detail = "Turn on sync to resolve the conflict"
  } else if (showDirty) {
    detail =
      status === "paused"
        ? "Unsynced changes. Turn on sync or use Sync now"
        : "Unsynced changes. They will sync when reconnected"
  }

  if (!isAuthenticated) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => navigate(SIGN_IN_ROUTE)}
            className="flex h-9 shrink-0 items-center gap-2 rounded-md px-2.5 text-fg-muted text-xs font-sans outline-none transition-colors hover:bg-white/[0.06] hover:text-fg focus-visible:ring-1 focus-visible:ring-ring"
          >
            <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            Sign in to sync
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="end">
          <div className="font-medium">{label}</div>
          <div className="text-fg-subtle">{detail}</div>
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="relative flex h-9 w-7 shrink-0 items-center justify-center"
          aria-label={label}
        >
          <Icon
            className={`h-[18px] w-[18px] ${cls} ${spin ? "animate-spin" : ""}`}
            strokeWidth={1.75}
          />
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
        <div className="text-fg-subtle">{detail}</div>
      </TooltipContent>
    </Tooltip>
  )
}
