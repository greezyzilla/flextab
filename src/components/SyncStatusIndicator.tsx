import { useEffect, useMemo, useState } from "react"
import type { LucideIcon } from "lucide-react"
import { Cloud, CloudOff, HardDrive, RefreshCw } from "lucide-react"
import { useSyncStore, formatRelativeTime } from "~src/store/useSyncStore"
import { useAuthStore } from "~src/store/useAuthStore"
import { NEAR_CAP, tabCap, usePlanStore } from "~src/store/usePlanStore"
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore"
import { spaceTabCount } from "~src/services/spacesTree"
import { limitSummary } from "~src/services/syncLimit"
import { syncNow } from "~src/services/syncEngine"
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
 * - signed in + a conflict the user paused on → "Sync conflict" in words, and
 *   the popover reopens the resolver (TASK-10)
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
    cls = "text-danger"
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
    cls = "text-warning"
    label = "Sync paused"
    detail = `${limitSummary(limit, tabs, plan?.usage?.total_tabs === 0)} Everything stays on this device.`
    spin = false
  } else if (showConflict) {
    Icon = CloudOff
    cls = "text-danger"
    label = "Sync conflict"
    detail = "Sync is paused until you choose which changes to keep. Your tabs are safe on this device."
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
          <Button variant="quiet" size="bar" className="shrink-0" onClick={() => navigate(SIGN_IN_ROUTE)}>
            <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            Sign in to sync
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="end">
          <div className="font-medium">{label}</div>
          <div className="text-fg-subtle">{detail}</div>
        </TooltipContent>
      </Tooltip>
    )
  }

  const cap = tabCap(plan)
  // Usage joins the header only when it matters: near the cap (Von Restorff),
  // and never beside another state label, so one thing asks for attention.
  const near = !paused && !showConflict && cap !== undefined && cap > 0 && tabs >= cap * NEAR_CAP
  const usage = near ? `${tabs}/${cap}` : null

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) void usePlanStore.getState().load() }}>
      <PopoverTrigger asChild>
        <Button
          variant="quiet"
          size="bar-tight"
          className="relative shrink-0"
          aria-label={`Sync status: ${label}${usage ? `, ${tabs} of ${cap} tabs` : ""}`}
        >
          <Icon
            className={`h-[18px] w-[18px] ${cls} ${spin ? "animate-spin" : ""}`}
            strokeWidth={1.75}
            aria-hidden
          />
          {paused && <span className="text-warning">Sync paused</span>}
          {showConflict && !paused && <span className="text-danger">Sync conflict</span>}
          {usage && <span className="text-warning tabular-nums">{usage}</span>}
          {!paused && showDirty && (
            <span
              className="absolute left-[19px] top-1.5 h-[7px] w-[7px] rounded-full bg-amber-400 ring-2 ring-black-900"
              aria-hidden
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="flex w-72 flex-col gap-3 font-sans">
        <div className="flex flex-col gap-1">
          <p className="text-fg text-sm font-medium">{label}</p>
          <p className="text-fg-subtle text-xs leading-relaxed">{detail}</p>
        </div>
        {cap !== undefined && cap > 0 && <UsageBar label="Tabs" used={tabs} cap={cap} />}
        <div className="flex items-center justify-between gap-2">
          <Button variant="link" size="sm" onClick={() => { setOpen(false); navigate("/settings/sync") }}>
            Sync settings
          </Button>
          {paused ? (
            <Button variant="default" size="sm" onClick={() => { setOpen(false); navigate("/settings/plan") }}>
              See plan
            </Button>
          ) : showConflict && (
            // A one-shot Sync now reopens the resolver (the stored conflict, or a
            // fresh detection); it never turns auto-sync back on by itself.
            <Button variant="default" size="sm" onClick={() => { setOpen(false); void syncNow() }}>
              Resolve conflict
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
