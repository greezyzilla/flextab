import { useEffect, useLayoutEffect } from "react"
import { WorkspaceLoadError } from "~src/components/WorkspaceLoadError"
import { SyncConflictModal } from "~src/components/SyncConflictModal"
import { OverCapNotice } from "~src/components/OverCapNotice"
import { MergeConflictModal } from "~src/components/MergeConflictModal"
import { OnboardingScreen } from "~src/components/OnboardingScreen"
import { AppShell } from "~src/components/layout/AppShell"
import { ErrorBoundary } from "~src/components/ErrorBoundary"
import { TooltipProvider } from "~src/components/ui/tooltip"
import "@fontsource-variable/inter"
import "../../style.css"

import { useHydrated } from "~src/store/useSavedSpacesStore"
import { SIGN_IN_ROUTE } from "~src/lib/workspaceAccess"
import { navigate, useRoute } from "~src/lib/route"
import { useAuthStore } from "~src/store/useAuthStore"
import { startSyncEngine, stopSyncEngine, startLocalPersistence, stopLocalPersistence } from "~src/services/syncEngine"
import { pullSettings, startSettingsSync, stopSettingsSync } from "~src/services/settingsSync"
import { useSettingsStore } from "~src/store/useSettingsStore"
import { useRevealRequests } from "~src/hooks/useRevealRequests"
import { ShellSkeleton } from "~src/components/layout/ShellSkeleton"
import { SettingsSkeleton } from "~src/components/layout/SettingsSkeleton"
import { isSettingsRoute } from "~src/components/settings/types"
import { installUpdatePrepareListener } from "~src/services/updatePrepare"
import { watchApiAccess } from "~src/services/apiAccess"
import { watchUpdateRequired } from "~src/services/updateRequired"
import { useSyncStore } from "~src/store/useSyncStore"

// Before an update reload, the background asks this page to finish its writes (TASK-113).
installUpdatePrepareListener()
// Sync needs access to the server, which the browser can take away (TASK-112).
watchApiAccess((allowed) => useSyncStore.getState().setApiAccess(allowed))
// The server can refuse a version that is too old (TASK-114).
watchUpdateRequired((required) => useSyncStore.getState().setUpdateRequired(required !== null))

// The mode and look are on <html> before the first paint: newtab.html's boot script (TASK-107).


function NewTabPage() {
  const { hydrated, error: hydrationError } = useHydrated()
  const { initialize, isAuthenticated, isLoading: authLoading, user } = useAuthStore()
  const autoSync = useSettingsStore((s) => s.autoSync)
  const route = useRoute()
  const onSignInRoute = route === SIGN_IN_ROUTE
  // The popup's "Open in FlexTab" (TASK-75).
  useRevealRequests(hydrated && !authLoading)

  useEffect(() => {
    initialize()
  }, [])

  // newtab.html's boot copy of the skeleton held the place while the script loaded; this first
  // commit draws the same markup (or the workspace in its place), so it goes before that paints.
  useLayoutEffect(() => { document.getElementById("boot-skeleton")?.remove() }, [])

  // Local persistence is always on once hydrated — guests and auto-sync-off
  // users still get every change written to chrome.storage.
  useEffect(() => {
    if (!hydrated) return
    startLocalPersistence()
    return () => stopLocalPersistence()
  }, [hydrated])

  // Realtime sync engine: only when signed in AND auto-sync is enabled.
  // Restarts when the account identity settles (/me after sign-in): that change
  // makes the running session stale and cancels its first reconcile, so without
  // a restart the sign-in choice would wait for the next new tab (TASK-11).
  const userId = user?.id
  const apiAccess = useSyncStore((s) => s.apiAccess)
  const updateRequired = useSyncStore((s) => s.updateRequired)
  useEffect(() => {
    if (!hydrated || !isAuthenticated || !autoSync || !apiAccess || updateRequired) return
    startSyncEngine()
    return () => stopSyncEngine()
  }, [hydrated, isAuthenticated, autoSync, userId, apiAccess, updateRequired])

  // Account settings (theme/layout/etc.): pull on sign-in, then push on change.
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return
    pullSettings()
    startSettingsSync()
    return () => stopSettingsSync()
  }, [isAuthenticated, user?.id])

  if (hydrationError) return <WorkspaceLoadError />
  // The loading shell is the page that is coming: Settings on a Settings route (TASK-108), else the workspace.
  if (authLoading || !hydrated) return isSettingsRoute(route) ? <SettingsSkeleton route={route} /> : <ShellSkeleton />
  // The workspace is always local and usable, signed in or not (TASK-7).
  // Sign-in is a place you go to (rail, popup, getting-started card): it opens
  // over the workspace (TASK-79), never as a wall in front of it.
  return (
    <TooltipProvider delayDuration={300}>
      <ErrorBoundary>
        <AppShell />
        {onSignInRoute && <OnboardingScreen onBack={() => navigate("/")} />}
        <SyncConflictModal />
        <OverCapNotice />
        <MergeConflictModal />
      </ErrorBoundary>
    </TooltipProvider>
  )
}

export default NewTabPage
