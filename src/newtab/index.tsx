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

import { useHydrated, useSavedSpacesStore } from "~src/store/useSavedSpacesStore"
import { spaceTabCount } from "~src/services/spacesTree"
import { useAuthStore } from "~src/store/useAuthStore"
import { startSyncEngine, stopSyncEngine, startLocalPersistence, stopLocalPersistence } from "~src/services/syncEngine"
import { pullSettings, startSettingsSync, stopSettingsSync } from "~src/services/settingsSync"
import { useSettingsStore } from "~src/store/useSettingsStore"

function LoadingScreen() {
  return (
    <div className="flex items-center justify-center h-screen w-screen bg-black-900">
      <div className="text-white/50 font-sans text-sm">Loading...</div>
    </div>
  )
}

function NewTabPage() {
  const { hydrated, error: hydrationError } = useHydrated()
  const { initialize, isAuthenticated, isLoading: authLoading, guestMode, user } = useAuthStore()
  const autoSync = useSettingsStore((s) => s.autoSync)
  // A previously-authenticated device whose session just dropped (e.g. the
  // refresh-token race, or any other involuntary logout) still has its real
  // tabs sitting in the local Yjs doc — `savedSpaces` is populated by
  // hydration regardless of auth state. Gating the full-screen onboarding
  // wall on auth alone would hide those tabs behind a login page they never
  // asked to see. Checking actual tab content (not just space count) matters
  // because a fresh/logged-out account still seeds one empty default space.
  const savedSpaces = useSavedSpacesStore((s) => s.savedSpaces)
  const hasSavedTabs = savedSpaces.some((s) => spaceTabCount(s) > 0)

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
  if (!isAuthenticated && !guestMode && !hasSavedTabs) return <OnboardingScreen />

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
