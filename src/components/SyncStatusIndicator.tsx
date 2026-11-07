import { useEffect, useMemo, useState } from "react"
import type { LucideIcon } from "lucide-react"
import { Cloud, CloudOff, HardDrive, RefreshCw } from "lucide-react"
import { useSyncStore, formatRelativeTime } from "~src/store/useSyncStore"
import { useAuthStore } from "~src/store/useAuthStore"
import { NEAR_CAP, tabCap, usePlanStore } from "~src/store/usePlanStore"
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore"
import { spaceTabCount } from "~src/services/spacesTree"
import { limitSummary } from "~src/services/syncLimit"
import { Tooltip, TooltipTrigger, TooltipContent } from "./ui/tooltip"
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover"
import { Button } from "./ui/button"
import { UsageBar } from "./settings/shared"
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
 * - signed in + over the plan's tab cap → "Sync paused" in words (TASK-9), so
 *   the state never rests on colour alone; the button opens the details.
 */
export function SyncStatusIndicator() {
  const status = useSyncStore((s) => s.status)
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt)
  const dirty = useSyncStore((s) => s.dirty)
  const conflictPending = useSyncStore((s) => s.conflictPending)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const userId = useAuthStore((s) => s.user?.id)
  const limit = useSyncStore((s) => s.limit)
  const plan = usePlanStore((s) => s.status)
  const savedSpaces = useSavedSpacesStore((s) => s.savedSpaces)
  const tabs = useMemo(() => savedSpaces.reduce((n, sp) => n + spaceTabCount(sp), 0), [savedSpaces])
  const [open, setOpen] = useState(false)

  // The cap belongs to the account: reload it when the account changes.
  useEffect(() => {
    if (!isAuthenticated || !userId) return
    usePlanStore.getState().clear()
    void usePlanStore.getState().load()
  }, [isAuthenticated, userId])

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

  const paused = isAuthenticated && limit !== null
  if (paused) {
    Icon = CloudOff
    cls = "text-amber-300"
    label = "Sync paused"
    detail = `${limitSummary(limit, tabs)} Everything stays on this device.`
    spin = false
  } else if (showConflict) {
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

  const cap = tabCap(plan)
  // Usage joins the header only when it matters: near the cap (Von Restorff).
  const near = !paused && cap !== undefined && cap > 0 && tabs >= cap * NEAR_CAP
  const usage = near ? `${tabs}/${cap}` : null

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) void usePlanStore.getState().load() }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Sync status: ${label}${usage ? `, ${tabs} of ${cap} tabs` : ""}`}
          className="relative flex h-9 shrink-0 items-center gap-1.5 rounded-md px-1.5 text-xs font-sans outline-none transition-colors hover:bg-white/[0.06] focus-visible:ring-1 focus-visible:ring-ring"
        >
          <Icon
            className={`h-[18px] w-[18px] ${cls} ${spin ? "animate-spin" : ""}`}
            strokeWidth={1.75}
            aria-hidden
          />
          {paused && <span className="text-amber-300">Sync paused</span>}
          {usage && <span className="text-amber-300 tabular-nums">{usage}</span>}
          {!paused && (showConflict || showDirty) && (
            <span
              className={`absolute left-[19px] top-1.5 h-[7px] w-[7px] rounded-full ring-2 ring-black-900 ${
                showConflict ? "bg-red-500" : "bg-amber-400"
              }`}
              aria-hidden
            />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="flex w-72 flex-col gap-3 font-sans">
        <div className="flex flex-col gap-1">
          <p className="text-fg text-sm font-medium">{label}</p>
          <p className="text-fg-subtle text-xs leading-relaxed">{detail}</p>
        </div>
        {cap !== undefined && cap > 0 && <UsageBar label="Tabs" used={tabs} cap={cap} />}
        <div className="flex items-center justify-between gap-2">
          <Button variant="link" size="sm" className="!px-0" onClick={() => { setOpen(false); navigate("/settings/sync") }}>
            Sync settings
          </Button>
          {paused && (
            <Button variant="default" size="sm" onClick={() => { setOpen(false); navigate("/settings/plan") }}>
              See plan
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
