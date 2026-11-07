import { useEffect } from "react"
import { WorkspaceLoadError } from "~src/components/WorkspaceLoadError"
import { SyncConflictModal } from "~src/components/SyncConflictModal"
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

function LoadingScreen() {
  return (
    <div className="flex items-center justify-center h-screen w-screen bg-black-900">
      <div className="text-fg-subtle font-sans text-sm">Loading...</div>
    </div>
  )
}

function NewTabPage() {
  const { hydrated, error: hydrationError } = useHydrated()
  const { initialize, isAuthenticated, isLoading: authLoading, user } = useAuthStore()
  const autoSync = useSettingsStore((s) => s.autoSync)
  const onSignInRoute = useRoute() === SIGN_IN_ROUTE

  // Signing in from the sign-in screen lands back in the workspace.
  useEffect(() => {
    if (isAuthenticated && onSignInRoute) navigate("/")
  }, [isAuthenticated, onSignInRoute])

  useEffect(() => {
    initialize()
  }, [])

  // Local persistence is always on once hydrated — guests and auto-sync-off
  // users still get every change written to chrome.storage.
  useEffect(() => {
    if (!hydrated) return
    startLocalPersistence()
    return () => stopLocalPersistence()
  }, [hydrated])

  // Realtime sync engine: only when signed in AND auto-sync is enabled.
  useEffect(() => {
    if (!hydrated || !isAuthenticated || !autoSync) return
    startSyncEngine()
    return () => stopSyncEngine()
  }, [hydrated, isAuthenticated, autoSync])

  // Account settings (theme/layout/etc.): pull on sign-in, then push on change.
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return
    pullSettings()
    startSettingsSync()
    return () => stopSettingsSync()
  }, [isAuthenticated, user?.id])

  if (hydrationError) return <WorkspaceLoadError />
  if (authLoading) return <LoadingScreen />
  if (!hydrated) return <LoadingScreen />
  // The workspace is always local and usable, signed in or not (TASK-7).
  // Sign-in is a place you go to (rail, popup, getting-started card), with a
  // way back to the tabs, never a wall in front of them.
  if (onSignInRoute && !isAuthenticated) return <OnboardingScreen onBack={() => navigate("/")} />

  return (
    <TooltipProvider delayDuration={300}>
      <ErrorBoundary>
        <AppShell />
        <SyncConflictModal />
        <MergeConflictModal />
      </ErrorBoundary>
    </TooltipProvider>
  )
}

export default NewTabPage
