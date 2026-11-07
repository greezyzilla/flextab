import type { LucideIcon } from "lucide-react"
import { Cloud, CloudOff, HardDrive, RefreshCw } from "lucide-react"
import { useSyncStore, formatRelativeTime } from "~src/store/useSyncStore"
import { useAuthStore } from "~src/store/useAuthStore"
import { Tooltip, TooltipTrigger, TooltipContent } from "./ui/tooltip"

/**
 * Header sync badge.
 *
 * Keep these product states separate:
 * - not signed in / guest → local device only (HardDrive) — never "Offline"
 * - signed in + no transport → Offline (CloudOff)
 * - signed in + auto-sync off → paused (Cloud)
 */
export function SyncStatusIndicator() {
  const status = useSyncStore((s) => s.status)
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt)
  const dirty = useSyncStore((s) => s.dirty)
  const conflictPending = useSyncStore((s) => s.conflictPending)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const guestMode = useAuthStore((s) => s.guestMode)

  let Icon: LucideIcon = Cloud
  let cls = "text-fg-subtle"
  let label = "Auto-sync off"
  let detail = formatRelativeTime(lastSyncedAt)
  let spin = false

  if (!isAuthenticated) {
    Icon = HardDrive
    cls = guestMode ? "text-fg-subtle" : "text-fg-subtle"
    label = guestMode ? "Guest" : "Local only"
    detail = guestMode
      ? "Local only on this device. Sign in anytime to sync"
      : "Not signed in. Tabs stay on this device"
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
