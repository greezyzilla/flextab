import { useEffect, useState } from "react"
import { ContentPanel, LeftPanel, ProfilePanel, RightPanel, Drawer, DragOverlayContent } from "~src/components"
import { SearchBar } from "~src/components/SearchBar"
import { UndoToastContainer } from "~src/components/UndoToast"
import { SyncConflictModal } from "~src/components/SyncConflictModal"
import { ErrorBoundary } from "~src/components/ErrorBoundary"
import { TooltipProvider } from "~src/components/ui/Tooltip"
import { Button, IconButton } from "~src/components/ui/Button"
import "@fontsource-variable/inter"
import "../../style.css"

import { DndContext, DragOverlay } from "@dnd-kit/core"
import { useDragAndDrop } from "~src/hooks/useDragAndDrop"
import { useKeyboardShortcuts } from "~src/hooks/useKeyboardShortcuts"
import { useTheme } from "~src/hooks/useTheme"
import { useShellLayout } from "~src/hooks/useMediaQuery"
import { useUIStore } from "~src/store/useUIStore"
import { useHydrated } from "~src/store/useSavedSpacesStore"
import { useAuthStore } from "~src/store/useAuthStore"
import { startSyncEngine, stopSyncEngine, startLocalPersistence, stopLocalPersistence } from "~src/services/syncEngine"
import { useSettingsStore } from "~src/store/useSettingsStore"

function LoadingScreen() {
  return (
    <div className="flex items-center justify-center h-screen w-screen bg-black-900">
      <div className="text-white/50 font-sans text-sm">Loading...</div>
    </div>
  )
}

function OnboardingScreen() {
  const { loginWithGoogle, loginWithEmail, register, continueAsGuest } = useAuthStore()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'register') {
        await register(email, password, name)
      } else {
        await loginWithEmail(email, password)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col lg:flex-row min-h-screen w-screen bg-black-900 font-sans overflow-x-hidden overflow-y-auto lg:overflow-hidden">
      {/* Left — hero */}
      <div className="flex-1 flex flex-col justify-between p-6 sm:p-10 min-w-0 relative">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/[0.07] via-transparent to-purple-600/[0.05]" />
        <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-blue-500/[0.04] rounded-full blur-[120px] -translate-x-1/3 -translate-y-1/3" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-indigo-500/[0.03] rounded-full blur-[100px] translate-x-1/4 translate-y-1/4" />
        <div className="relative z-10 flex-1 flex flex-col justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-white/20 to-white/5 border border-white/10 flex items-center justify-center">
            <svg className="w-4 h-4 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
            </svg>
          </div>
          <span className="text-white/70 text-sm font-medium">FlexTab</span>
        </div>

        <div className="flex flex-col gap-6 max-w-lg">
          <h1 className="text-white/90 text-3xl sm:text-4xl font-semibold tracking-tight leading-[1.15]">
            Stop losing tabs.<br />Start organizing them.
          </h1>
          <p className="text-white/40 text-sm sm:text-base leading-relaxed max-w-md">
            FlexTab replaces your new tab page with a workspace that saves, groups, and syncs your browsing sessions across every device.
          </p>
        </div>

        <div className="hidden lg:block rounded-xl border border-black-800 overflow-hidden max-w-2xl" style={{ backgroundColor: 'color-mix(in srgb, var(--color-black-950) 80%, transparent)' }}>
          <div className="flex border-b border-black-800">
            <div className="w-10 border-r border-black-800 p-2 flex flex-col items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-white/15" />
              <div className="w-6 h-6 rounded-full bg-white/8" />
              <div className="w-6 h-6 rounded-full border border-dashed border-white/20" />
            </div>
            <div className="flex-1 flex items-center gap-4 px-4 py-2.5">
              <div className="text-white/50 text-xs font-medium">Personal</div>
              <div className="flex gap-2">
                <div className="px-2 py-0.5 rounded bg-white/10 text-white/50 text-[10px]">Work</div>
                <div className="px-2 py-0.5 rounded bg-white/5 text-white/30 text-[10px]">Research</div>
              </div>
            </div>
          </div>
          <div className="flex">
            <div className="flex-1 p-3 flex flex-col gap-2">
              <div className="rounded-lg bg-white/[0.03] border border-white/5 p-2.5">
                <div className="text-white/50 text-[10px] font-medium mb-2">Sprint Planning</div>
                <div className="flex flex-col gap-1.5">
                  {["Linear — Current Sprint", "Figma — Design System", "GitHub — Pull Requests"].map((t, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded bg-white/10 shrink-0" />
                      <div className="text-white/30 text-[10px] truncate">{t}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-lg bg-white/[0.03] border border-white/5 p-2.5">
                <div className="text-white/50 text-[10px] font-medium mb-2">API Docs</div>
                <div className="flex flex-col gap-1.5">
                  {["Stripe — Webhooks", "Vercel — Deployments"].map((t, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded bg-white/10 shrink-0" />
                      <div className="text-white/30 text-[10px] truncate">{t}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="w-48 border-l border-black-800 p-3">
              <div className="text-white/40 text-[10px] font-medium mb-2">Opened Tabs</div>
              <div className="flex flex-col gap-1.5">
                {["localhost:3000", "claude.ai", "github.com", "notion.so", "figma.com"].map((t, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded bg-white/10 shrink-0" />
                    <div className="text-white/25 text-[10px] truncate">{t}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>

      {/* Right — sign in */}
      <div className="w-full lg:w-[420px] shrink-0 flex flex-col justify-center border-t lg:border-t-0 lg:border-l border-black-800 p-6 sm:p-10" style={{ backgroundColor: 'color-mix(in srgb, var(--color-black-950) 50%, transparent)' }}>
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h2 className="text-white/85 text-xl font-medium">
              {mode === 'login' ? 'Welcome back' : 'Create an account'}
            </h2>
            <p className="text-white/35 text-sm leading-relaxed">
              {mode === 'login'
                ? 'Sign in to sync your tabs across devices.'
                : 'Get started with FlexTab — organize and sync your tabs.'}
            </p>
          </div>

          {/* Email/Password form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            {mode === 'register' && (
              <input
                type="text"
                placeholder="Name"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-4 py-2.5 bg-white/[0.06] border border-white/10 rounded-lg text-white/90 text-sm placeholder:text-white/25 outline-none focus:border-white/25 transition-colors"
                required
              />
            )}
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 bg-white/[0.06] border border-white/10 rounded-lg text-white/90 text-sm placeholder:text-white/25 outline-none focus:border-white/25 transition-colors"
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 bg-white/[0.06] border border-white/10 rounded-lg text-white/90 text-sm placeholder:text-white/25 outline-none focus:border-white/25 transition-colors"
              required
              minLength={8}
            />
            {error && <div className="text-red-400 text-xs">{error}</div>}
            <Button variant="primary" type="submit" disabled={loading} className="w-full">
              {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
            </Button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-white/5" />
            <span className="text-white/20 text-xs">or</span>
            <div className="flex-1 h-px bg-white/5" />
          </div>

          {/* Google OAuth */}
          <Button variant="ghost" onClick={loginWithGoogle} className="w-full">
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Continue with Google
          </Button>

          {/* Toggle mode */}
          <div className="text-center">
            <Button variant="link" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }} className="!text-xs !text-white/30 hover:!text-white/50">
              {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
            </Button>
          </div>

          {/* Try without an account — local-only until you sign in */}
          <div className="flex flex-col items-center gap-1.5 pt-1">
            <Button variant="link" onClick={() => continueAsGuest()} className="!text-sm !text-white/55 hover:!text-white/80">
              Continue without an account →
            </Button>
            <span className="text-white/25 text-[11px]">Saved locally on this device. Sign in anytime to sync.</span>
          </div>

          <p className="text-white/15 text-[11px] leading-relaxed">
            By continuing, you agree to FlexTab's terms of service and privacy policy.
          </p>
        </div>
      </div>
    </div>
  )
}

function MenuIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
    </svg>
  )
}

function OpenedTabsIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m-3.75 0h13.5A2.25 2.25 0 0 0 21 17.25V6.75A2.25 2.25 0 0 0 18.75 4.5H5.25A2.25 2.25 0 0 0 3 6.75v10.5A2.25 2.25 0 0 0 5.25 19.5Z" />
    </svg>
  )
}

function NewTabPageContent() {
  useTheme();
  useKeyboardShortcuts();
  const {
    handleDragStart,
    handleDragEnd,
    collisionDetectionStrategy,
    activeId,
    draggedTab,
    draggedSavedTab,
    draggedGroup
  } = useDragAndDrop();

  const { leftInline, rightInline } = useShellLayout();
  const {
    leftDrawerOpen, rightDrawerOpen,
    setLeftDrawerOpen, setRightDrawerOpen,
    toggleLeftDrawer, toggleRightDrawer,
  } = useUIStore();

  return (
    <DndContext
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      collisionDetection={collisionDetectionStrategy}
    >
      <div className="flex h-screen w-screen bg-black-900 overflow-hidden">
        <ProfilePanel />

        {leftInline ? (
          <LeftPanel />
        ) : (
          <Drawer side="left" open={leftDrawerOpen} onClose={() => setLeftDrawerOpen(false)}>
            <LeftPanel />
          </Drawer>
        )}

        <div className="border-x border-black-800 flex-1 flex flex-col min-w-0">
          <div className="px-3 sm:px-5 py-3 flex items-center gap-2 border-b border-black-800 shrink-0">
            {!leftInline && (
              <IconButton onClick={toggleLeftDrawer} className="h-9 w-9 shrink-0" title="Spaces & navigation" aria-label="Toggle navigation">
                <MenuIcon />
              </IconButton>
            )}
            <SearchBar />
            {!rightInline && (
              <IconButton onClick={toggleRightDrawer} className="h-9 w-9 shrink-0" title="Opened tabs" aria-label="Toggle opened tabs">
                <OpenedTabsIcon />
              </IconButton>
            )}
          </div>
          <ContentPanel />
        </div>

        {rightInline ? (
          <RightPanel />
        ) : (
          <Drawer side="right" open={rightDrawerOpen} onClose={() => setRightDrawerOpen(false)}>
            <RightPanel />
          </Drawer>
        )}
      </div>

      <DragOverlay style={{ zIndex: 1000, pointerEvents: 'none' }}>
        <DragOverlayContent
          activeId={activeId}
          draggedGroup={draggedGroup}
          draggedTab={draggedTab}
          draggedSavedTab={draggedSavedTab}
        />
      </DragOverlay>

      <UndoToastContainer />
    </DndContext>
  )
}

function NewTabPage() {
  const hydrated = useHydrated();
  const { initialize, isAuthenticated, isLoading: authLoading, guestMode } = useAuthStore();
  const autoSync = useSettingsStore((s) => s.autoSync);

  useEffect(() => {
    initialize();
  }, []);

  // Local persistence is always on once hydrated — guests and auto-sync-off
  // users still get every change written to chrome.storage.
  useEffect(() => {
    if (!hydrated) return;
    startLocalPersistence();
    return () => stopLocalPersistence();
  }, [hydrated]);

  // Realtime sync engine: only when signed in AND auto-sync is enabled.
  useEffect(() => {
    if (!hydrated || !isAuthenticated || !autoSync) return;
    startSyncEngine();
    return () => stopSyncEngine();
  }, [hydrated, isAuthenticated, autoSync]);

  if (authLoading) return <LoadingScreen />;
  if (!isAuthenticated && !guestMode) return <OnboardingScreen />;
  if (!hydrated) return <LoadingScreen />;

  return (
    <TooltipProvider>
      <ErrorBoundary>
        <NewTabPageContent />
        <SyncConflictModal />
      </ErrorBoundary>
    </TooltipProvider>
  )
}

export default NewTabPage