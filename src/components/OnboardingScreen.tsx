import { useEffect, useState } from "react"
import { Button } from "~src/components/ui/button"
import { Input } from "~src/components/ui/input"
import { Label } from "~src/components/ui/label"
import { apiGetAuthProviders } from "~src/services/api"
import { SESSION_EXPIRED_KEY } from "~src/services/api"
import { useAuthStore } from "~src/store/useAuthStore"

// Where the legal pages are hosted (flextab-landing's /terms.html and
// /privacy.html).
const LEGAL_BASE_URL = "https://flextabmanager.com"

/** The same mark as the space rail's (manifest icon tinted with the accent), so this reads as the same app. */
function AppMark() {
  const icon = typeof chrome !== "undefined" && chrome.runtime?.getManifest ? chrome.runtime.getManifest().icons?.["128"] : undefined
  const src = icon && chrome.runtime?.getURL ? chrome.runtime.getURL(icon) : undefined
  return (
    <div
      className="w-10 h-10 rounded-2xl border flex items-center justify-center"
      style={{
        backgroundColor: "var(--accent-subtle)",
        borderColor: "color-mix(in srgb, var(--accent) 34%, transparent)",
        boxShadow: "0 10px 24px -18px var(--accent), inset 0 1px 0 rgba(255,255,255,0.08)",
      }}
    >
      {src ? (
        <span aria-hidden className="h-7 w-7" style={{
          background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 70%, #ffffff), var(--accent))",
          WebkitMask: `url(${src}) center / contain no-repeat`,
          mask: `url(${src}) center / contain no-repeat`,
        }} />
      ) : (
        <span aria-hidden className="text-sm font-semibold" style={{ color: "var(--accent)" }}>F</span>
      )}
    </div>
  )
}

/**
 * Sign-in (TASK-7). Reached only from inside the app ("Sign in to sync", the
 * rail, the popup), so it is one focused column: no product pitch competing
 * with the task, and back to the tabs where back navigation is expected.
 */
export function OnboardingScreen({ onBack }: {
  /** Back to the local workspace: sign-in is a place you visit, never a wall (TASK-7). */
  onBack: () => void
}) {
  const { loginWithGoogle, loginWithGithub, loginWithEmail } = useAuthStore()
  // Only show OAuth buttons for providers the server has configured (Google is
  // required; GitHub is optional). Default to Google if the check fails.
  const [providers, setProviders] = useState<string[] | null>(null)
  useEffect(() => { apiGetAuthProviders().then(setProviders).catch(() => setProviders(['google'])) }, [])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionExpired, setSessionExpired] = useState(false)

  // A 401 / failed refresh drops the user here without explanation — api.ts
  // leaves a note in storage; show it once so the sign-out isn't silent.
  useEffect(() => {
    try {
      chrome.storage.local.get(SESSION_EXPIRED_KEY).then(r => {
        if (r[SESSION_EXPIRED_KEY]) {
          setSessionExpired(true)
          void chrome.storage.local.remove(SESSION_EXPIRED_KEY)
        }
      })
    } catch (_) { /* no extension context */ }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await loginWithEmail(email, password)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-screen overflow-y-auto bg-black-900 font-sans">
      <div className="px-6 pt-5">
        <Button variant="link" onClick={onBack} className="!px-0 !text-sm !text-fg-muted hover:!text-fg">
          ← Back to my tabs
        </Button>
      </div>

      <main className="mx-auto flex w-full max-w-[400px] flex-col gap-6 px-6 pb-12 pt-6 sm:pt-14">
        <AppMark />

        {sessionExpired && (
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-warning-body/90 text-xs leading-relaxed">
            Your session expired. Sign in again to keep syncing. Your tabs are still saved on this device.
          </div>
        )}

        {/* One heading for both: the provider buttons sign in or create the
            account, so the screen never guesses "welcome back". New accounts are
            Google/GitHub only (TASK-8): those providers own account recovery. */}
        <div className="flex flex-col gap-2">
          <h1 className="text-fg text-xl font-medium">Sync your tabs</h1>
          <p className="text-fg-subtle text-sm leading-relaxed">Google or GitHub signs you in, or creates a free account. The tabs on this device stay put.</p>
        </div>

        {/* Fastest path first (Hick): one click, no password. Google is the one
            primary action; everything else is secondary. */}
        <div className="flex flex-col gap-3">
          {(providers === null || providers.includes('google')) && (
            <Button variant="default" onClick={loginWithGoogle} className="w-full">
              <span className="flex h-5 w-5 items-center justify-center rounded-sm bg-white">
                <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden>
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
              </span>
              Continue with Google
            </Button>
          )}
          {providers?.includes('github') && (
            <Button variant="secondary" onClick={loginWithGithub} className="w-full">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M12 1C5.92 1 1 5.92 1 12c0 4.86 3.15 8.98 7.52 10.44.55.1.75-.24.75-.53v-1.86c-3.06.67-3.71-1.47-3.71-1.47-.5-1.27-1.22-1.61-1.22-1.61-1-.68.08-.67.08-.67 1.1.08 1.68 1.13 1.68 1.13.98 1.68 2.57 1.2 3.2.92.1-.71.38-1.2.69-1.47-2.44-.28-5.01-1.22-5.01-5.43 0-1.2.43-2.18 1.13-2.95-.11-.28-.49-1.4.11-2.92 0 0 .92-.3 3.02 1.13a10.5 10.5 0 0 1 5.5 0c2.1-1.42 3.02-1.13 3.02-1.13.6 1.52.22 2.64.11 2.92.7.77 1.13 1.75 1.13 2.95 0 4.22-2.58 5.15-5.03 5.42.4.34.75 1.01.75 2.04v3.03c0 .29.2.63.76.52A11 11 0 0 0 23 12c0-6.08-4.92-11-11-11z" />
              </svg>
              Continue with GitHub
            </Button>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-ink/10" />
          <span className="text-fg-subtle text-xs">or sign in with email</span>
          <div className="flex-1 h-px bg-ink/10" />
        </div>

        {/* Labels stay visible while typing (WCAG 1.3.1 / 3.3.2). */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="signin-email">Email</Label>
            <Input id="signin-email" type="email" placeholder="you@example.com" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full" required
              aria-describedby={error ? "signin-error" : undefined} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="signin-password">Password</Label>
            <Input id="signin-password" type="password" placeholder="Enter your password" autoComplete="current-password"
              value={password} onChange={e => setPassword(e.target.value)} className="w-full" required
              aria-describedby={error ? "signin-error" : undefined} />
          </div>
          {error && <div id="signin-error" role="alert" className="text-danger text-xs">{error}</div>}
          <Button variant="secondary" type="submit" disabled={loading} className="w-full">
            {loading ? 'Please wait…' : 'Sign in'}
          </Button>
        </form>

        <p className="text-fg-subtle text-[11px] leading-relaxed">
          By continuing, you agree to FlexTab's{' '}
          <a href={`${LEGAL_BASE_URL}/terms.html`} target="_blank" rel="noreferrer" className="underline hover:text-fg">terms of service</a>
          {' '}and{' '}
          <a href={`${LEGAL_BASE_URL}/privacy.html`} target="_blank" rel="noreferrer" className="underline hover:text-fg">privacy policy</a>.
        </p>
      </main>
    </div>
  )
}
