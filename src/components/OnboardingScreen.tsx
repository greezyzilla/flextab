import { useEffect, useRef, useState } from "react"
import { Copy, Mail, ShieldCheck } from "lucide-react"
import { toast } from "sonner"
import { Button, IconTooltip } from "~src/components/ui/button"
import { Icon } from "~src/components/ui/icon"
import { IconText } from "~src/components/ui/icon-text"
import { DoneCheck } from "~src/components/ui/done-check"
import { BrandMark } from "~src/components/ui/brand-mark"
import { Input, PasswordField } from "~src/components/ui/input"
import { Label } from "~src/components/ui/label"
import { Modal, ModalHeader } from "~src/components/ui/modal"
import { ApiError, apiForgotPassword, apiGetSignInOptions, apiRegister, apiResendVerification } from "~src/services/api"
import { requestApiAccess } from "~src/services/apiAccess"

// Signing in sends the email to the server, which needs the browser's OK first (TASK-112).
const NO_ACCESS = "Allow FlexTab to reach its server to sign in."
import { SESSION_EXPIRED_KEY } from "~src/services/api"
import { OAUTH_PENDING_KEY, OAUTH_PROVIDERS, type OAuthProvider } from "~src/services/oauthLogin"
import { spaceTabCount } from "~src/services/spacesTree"
import { useAuthStore } from "~src/store/useAuthStore"
import { useMergeConflict } from "~src/store/useMergeConflict"
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore"
import { useSettingsStore } from "~src/store/useSettingsStore"
import { useSyncConflict } from "~src/store/useSyncConflict"
import { useSyncStore } from "~src/store/useSyncStore"
import { TextLink } from "~src/components/ui/text-link"
import { PROVIDER_BRAND } from "~src/lib/data-colours"

// Where the legal pages are hosted (flextab-landing's /terms.html and
// /privacy.html). The site is also where FlexTab is installed from.
const LEGAL_BASE_URL = "https://flextabmanager.com"

// The offer side carries the accent, so it reads as FlexTab in any theme.
const GLOW = "radial-gradient(90% 70% at 100% 0%, color-mix(in srgb, var(--accent) 26%, transparent), transparent 70%), radial-gradient(80% 60% at 0% 100%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 70%), var(--color-black-950)"

function GoogleMark() {
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-white">
      <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden>
                    <path fill={PROVIDER_BRAND.googleBlue} d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                    <path fill={PROVIDER_BRAND.googleGreen} d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill={PROVIDER_BRAND.googleYellow} d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill={PROVIDER_BRAND.googleRed} d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
    </span>
  )
}

function GithubMark() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 1C5.92 1 1 5.92 1 12c0 4.86 3.15 8.98 7.52 10.44.55.1.75-.24.75-.53v-1.86c-3.06.67-3.71-1.47-3.71-1.47-.5-1.27-1.22-1.61-1.22-1.61-1-.68.08-.67.08-.67 1.1.08 1.68 1.13 1.68 1.13.98 1.68 2.57 1.2 3.2.92.1-.71.38-1.2.69-1.47-2.44-.28-5.01-1.22-5.01-5.43 0-1.2.43-2.18 1.13-2.95-.11-.28-.49-1.4.11-2.92 0 0 .92-.3 3.02 1.13a10.5 10.5 0 0 1 5.5 0c2.1-1.42 3.02-1.13 3.02-1.13.6 1.52.22 2.64.11 2.92.7.77 1.13 1.75 1.13 2.95 0 4.22-2.58 5.15-5.03 5.42.4.34.75 1.01.75 2.04v3.03c0 .29.2.63.76.52A11 11 0 0 0 23 12c0-6.08-4.92-11-11-11z" />
    </svg>
  )
}

/** GitLab and Discord marks: Simple Icons paths (CC0), in each brand's own colour. */
function GitlabMark() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill={PROVIDER_BRAND.gitlab} aria-hidden>
      <path d="m23.6004 9.5927-.0337-.0862L20.3.9814a.851.851 0 0 0-.3362-.405.8748.8748 0 0 0-.9997.0539.8748.8748 0 0 0-.29.4399l-2.2055 6.748H7.5375l-2.2057-6.748a.8573.8573 0 0 0-.29-.4412.8748.8748 0 0 0-.9997-.0537.8585.8585 0 0 0-.3362.4049L.4332 9.5015l-.0325.0862a6.0657 6.0657 0 0 0 2.0119 7.0105l.0113.0087.03.0213 4.976 3.7264 2.462 1.8633 1.4995 1.1321a1.0085 1.0085 0 0 0 1.2197 0l1.4995-1.1321 2.4619-1.8633 5.006-3.7489.0125-.01a6.0682 6.0682 0 0 0 2.0094-7.003z" />
    </svg>
  )
}

function DiscordMark() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill={PROVIDER_BRAND.discord} aria-hidden>
      <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
    </svg>
  )
}

/** The sign-in dialog's provider marks, reused by Settings › Sign-in & security. */
export function ProviderMark({ provider }: { provider: Provider }) {
  return provider === "google" ? <GoogleMark /> : provider === "github" ? <GithubMark /> : provider === "gitlab" ? <GitlabMark /> : <DiscordMark />
}

type Provider = OAuthProvider
/** Where sign-in is: offering, waiting on the provider's tab, that tab closed,
 * an email link on its way (verify a sign-up, or reset a password), asking for
 * the address to reset, or signed in. */
type Step =
  | { kind: "offer" }
  | { kind: "waiting"; provider: Provider; tabId: number }
  | { kind: "closed"; provider: Provider }
  // created: the account was just made here (TASK-96: that is a finished moment, the
  // link only turns sync on); a sign-in that is not verified yet comes back without it.
  | { kind: "check"; reason: "verify" | "reset"; email: string; created?: boolean }
  | { kind: "forgot" }
  | { kind: "done" }

const PROVIDER_NAME: Record<Provider, string> = { google: "Google", github: "GitHub", gitlab: "GitLab", discord: "Discord" }
/** One email per address per minute (the server's cooldown too). */
const RESEND_SECONDS = 60

/**
 * Sign-in (TASK-7), revamped as "turn on sync" (TASK-79). Reached only from
 * inside the app (the sync badge, the rail, the popup), by someone already
 * using FlexTab on this device. So it opens over their own workspace and
 * speaks in their numbers, and it carries the whole journey: the offer, the
 * wait while the provider's tab is open (with a way back to that tab, and
 * word when it was closed), an email sign-up with its verification link (any
 * address works, not only Google or GitHub ones), a forgotten password, and
 * the result, with the next step that makes sync worth it: the other computer.
 * A sync choice or conflict, when the account already has tabs, takes over
 * from the existing dialogs.
 */
export function OnboardingScreen({ onBack }: {
  /** Back to the workspace: sign-in is a place you visit, never a wall (TASK-7). */
  onBack: () => void
}) {
  const { loginWithGoogle, loginWithGithub, loginWithGitlab, loginWithDiscord, loginWithEmail, isAuthenticated, user } = useAuthStore()
  // Only offer what the server has configured: OAuth providers with
  // credentials, and email sign-up/reset when it can send email. Default to
  // Google if the check fails.
  const [options, setOptions] = useState<{ providers: string[]; emailSignup: boolean } | null>(null)
  useEffect(() => { apiGetSignInOptions().then(setOptions).catch(() => setOptions({ providers: ['google'], emailSignup: false })) }, [])
  const providers = options?.providers ?? null
  const offered = OAUTH_PROVIDERS.filter(p => providers?.includes(p))
  const compact = offered.length > 2
  // The dialog focuses the first provider as it opens; its name tooltip waits for
  // the first key or pointer move, so it never pops up (mid-animation, misplaced)
  // on its own.
  const interacted = useRef(false)
  useEffect(() => {
    const mark = () => { interacted.current = true }
    window.addEventListener("keydown", mark, { capture: true, once: true })
    window.addEventListener("pointermove", mark, { capture: true, once: true })
    return () => { window.removeEventListener("keydown", mark, { capture: true }); window.removeEventListener("pointermove", mark, { capture: true }) }
  }, [])
  const [mode, setMode] = useState<"signin" | "create">("signin")
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [sessionChecked, setSessionChecked] = useState(false)
  const [step, setStep] = useState<Step>({ kind: "offer" })

  const spaces = useSavedSpacesStore(s => s.savedSpaces)
  const tabs = spaces.reduce((sum, s) => sum + spaceTabCount(s), 0)

  // A 401 / failed refresh drops the user here without explanation — api.ts
  // leaves a note in storage; show it once so the sign-out isn't silent.
  useEffect(() => {
    try {
      chrome.storage.local.get(SESSION_EXPIRED_KEY).then(r => {
        if (r[SESSION_EXPIRED_KEY]) {
          setSessionExpired(true)
          void chrome.storage.local.remove(SESSION_EXPIRED_KEY)
        }
      }).finally(() => setSessionChecked(true))
    } catch (_) { setSessionChecked(true) /* no extension context */ }
  }, [])

  // Already signed in when this opened: there is nothing to offer, back to the tabs.
  // Signed in while it is open (any provider, any tab): show the result.
  const signedInAtOpen = useRef(isAuthenticated)
  useEffect(() => { if (signedInAtOpen.current) onBack() }, [])
  useEffect(() => { if (isAuthenticated && !signedInAtOpen.current) setStep({ kind: "done" }) }, [isAuthenticated])

  // The provider's tab closed without a session: say so, never wait forever.
  // (A successful sign-in stores the tokens before it closes the tab.)
  useEffect(() => {
    if (step.kind !== "waiting") return
    const onRemoved = (tabId: number) => {
      if (tabId !== step.tabId) return
      void chrome.storage.local.get("auth_tokens").then(r => { if (!r.auth_tokens) setStep({ kind: "closed", provider: step.provider }) })
    }
    chrome.tabs.onRemoved.addListener(onRemoved)
    return () => chrome.tabs.onRemoved.removeListener(onRemoved)
  }, [step])

  const startOAuth = async (provider: Provider) => {
    // Asked before the first await: browsers only prompt from the click itself.
    const access = requestApiAccess()
    if (!(await access)) { setError(NO_ACCESS); return }
    setError('')
    await { google: loginWithGoogle, github: loginWithGithub, gitlab: loginWithGitlab, discord: loginWithDiscord }[provider]()
    try {
      const pending = (await chrome.storage.session.get(OAUTH_PENDING_KEY))[OAUTH_PENDING_KEY]
      if (typeof pending?.tabId === "number") setStep({ kind: "waiting", provider, tabId: pending.tabId })
    } catch (_) { /* no extension context: stay on the offer */ }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const access = requestApiAccess()
    setError('')
    setLoading(true)
    try {
      if (!(await access)) { setError(NO_ACCESS); return }
      if (mode === "create") {
        await apiRegister(email.trim(), password)
        setStep({ kind: "check", reason: "verify", email: email.trim(), created: true })
      } else {
        await loginWithEmail(email.trim(), password)
      }
    } catch (err: unknown) {
      // Signed up but not verified yet: back to the link, not a dead end.
      if (err instanceof ApiError && err.code === "email_unverified") setStep({ kind: "check", reason: "verify", email: email.trim() })
      else setError(formProblem(err))
    } finally {
      setLoading(false)
    }
  }

  // The sync choice / conflict dialogs own the screen while they are open.
  const choicePending = useSyncConflict(s => s.pending)
  const mergePending = useMergeConflict(s => s.pending)

  const offer = tabs === 0
    ? "Open your tabs on any computer."
    : `Back up ${plural(tabs, "tab")}. Open them anywhere.`
  const emailSignup = options?.emailSignup === true
  const creating = mode === "create" && emailSignup

  return (
    // Opens once everything it shows is known (the sign-in options, a session
    // that expired), so nothing arrives later and moves what is on screen.
    <Modal kind="dialog" size="l" open={options !== null && sessionChecked && !signedInAtOpen.current && !choicePending && !mergePending}
      onOpenChange={o => { if (!o) onBack() }} dirty={email !== '' || password !== ''} initialFocus="primary">
      {/* One size for every step, so moving between them never resizes the card:
          exactly the tallest step (sign-in under two providers, its message line
          included), measured, so no step carries dead space of its own. In rem,
          so it grows with the UI scale; it scrolls rather than clips. */}
      <div className="-m-5 grid min-h-0 flex-1 overflow-y-auto rounded-xl sm:h-[30.125rem] sm:flex-none sm:grid-cols-2">
        {/* Brand at the top, the promise in the middle, trust at the foot: the space
            is shared out, not left in one hole. */}
        <section className="flex flex-col justify-between gap-8 p-8 pt-12" style={{ background: GLOW }}>
          <div className="flex items-center gap-3">
            <BrandMark />
            <span className="text-fg text-base font-semibold">FlexTab</span>
          </div>
          <div className="flex flex-col gap-3">
            <ModalHeader title={<span className="block text-2xl font-semibold leading-tight tracking-tight">Your tabs,{" "}<br />on every device</span>}
              description={offer} />
            {sessionExpired && (
              <p role="note" className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-warning-body/90 text-xs leading-relaxed">
                Session expired. Your tabs are safe here.
              </p>
            )}
          </div>
          {/* Trust, in the privacy policy's own promises (flextab-landing Privacy.tsx). */}
          <IconText icon={ShieldCheck}>We never read or sell your browsing.</IconText>
        </section>

        {/* Every step shares one frame: content from the same top line, left
            aligned, full-width buttons stacked, and its closing links pinned to the
            foot. A message under the buttons only takes the empty middle, so it
            never moves anything (no reserved slots needed). */}
        {/* Each step is one group (its links included), centred, so a short step
            shares out the space instead of leaving a hole. pt-12 keeps it clear of
            the close button. Messages have a reserved line, so nothing moves. */}
        <section className="flex min-h-0 flex-col justify-center p-8 pt-12">
          {step.kind === "offer" && (
            <Frame footer={<>
              {emailSignup && (
                <p className="text-fg-subtle text-xs">
                  {creating ? "Already have an account? " : "New to FlexTab? "}
                  <TextLink onClick={() => { setError(''); setMode(creating ? "signin" : "create") }}>
                    {creating ? "Sign in" : "Create an account"}
                  </TextLink>
                </p>
              )}
              <p className="text-fg-subtle text-caption leading-relaxed">
                By continuing, you accept the{' '}
                <a href={`${LEGAL_BASE_URL}/terms.html`} target="_blank" rel="noreferrer" className="underline hover:text-fg">Terms</a>
                {' '}and{' '}
                <a href={`${LEGAL_BASE_URL}/privacy.html`} target="_blank" rel="noreferrer" className="underline hover:text-fg">Privacy Policy</a>.
              </p>
            </>}>
              {/* Fastest path first (Hick): one click, no password. Each creates the
                  account too, so the screen never guesses "welcome back". Provider
                  buttons stay neutral, as on every sign-in page: the accent belongs to
                  this form's own submit. Focus still opens on the first provider. */}
              <div className={compact ? "grid gap-3" : "flex flex-col gap-3"} style={compact ? { gridTemplateColumns: `repeat(${offered.length}, minmax(0, 1fr))` } : undefined}>
                {offered.map(p => compact ? (
                  // More than two: one row of marks, each named by its tooltip and label
                  // (Clerk's "auto" rule), so the card keeps its height.
                  <IconTooltip key={p} content={`Continue with ${PROVIDER_NAME[p]}`} when={() => interacted.current}>
                    <Button variant="secondary" onClick={() => void startOAuth(p)} fullWidth aria-label={`Continue with ${PROVIDER_NAME[p]}`}
                      data-modal-primary={p === "google" ? "" : undefined}>
                      <ProviderMark provider={p} />
                    </Button>
                  </IconTooltip>
                ) : (
                  <Button key={p} variant="secondary" onClick={() => void startOAuth(p)} fullWidth data-modal-primary={p === "google" ? "" : undefined}>
                    <ProviderMark provider={p} />
                    Continue with {PROVIDER_NAME[p]}
                  </Button>
                ))}
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-ink/10" />
                <span className="text-fg-subtle text-xs">{creating ? "or create an account with email" : "or sign in with email"}</span>
                <div className="flex-1 h-px bg-ink/10" />
              </div>

              {/* Any address works, whoever runs its mail: the link we send proves it.
                  Labels stay visible while typing (WCAG 1.3.1 / 3.3.2). */}
              <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="signin-email">Email</Label>
                  <Input id="signin-email" type="email" placeholder="you@example.com" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required
                    aria-describedby={error ? "signin-error" : undefined} />
                </div>
                <div className="flex flex-col gap-1.5">
                  {/* Same height with or without "Forgot password?", so switching to
                      "Create an account" moves nothing. */}
                  <div className="flex h-4 items-center justify-between">
                    <Label htmlFor="signin-password">Password</Label>
                    {!creating && emailSignup && (
                      <TextLink tone="subtle" size="caption" onClick={() => { setError(''); setStep({ kind: "forgot" }) }}>Forgot password?</TextLink>
                    )}
                  </div>
                  <PasswordField id="signin-password" placeholder={creating ? "At least 8 characters" : "Enter your password"} autoComplete={creating ? "new-password" : "current-password"}
                    minLength={creating ? 8 : undefined} maxLength={creating ? 72 : undefined}
                    value={password} onChange={e => setPassword(e.target.value)} required
                    aria-describedby={error ? "signin-error" : undefined} />
                </div>
                <Button variant="default" type="submit" disabled={loading} fullWidth>
                  {loading ? 'Please wait…' : creating ? 'Create account' : 'Sign in'}
                </Button>
                <p id="signin-error" role="alert" className="h-4 truncate text-danger text-xs leading-4">{error}</p>
              </form>
            </Frame>
          )}

          {step.kind === "waiting" && <Waiting provider={step.provider} tabId={step.tabId} onCancel={() => setStep({ kind: "offer" })} />}

          {step.kind === "closed" && (
            <Frame>
              <StepHead tile={<Tile tone="neutral"><ProviderMark provider={step.provider} /></Tile>}
                title={`The ${PROVIDER_NAME[step.provider]} tab was closed`} />
              <div className="flex flex-col gap-2">
                <Button variant="default" fullWidth onClick={() => void startOAuth(step.provider)}>Try again</Button>
                <Button variant="secondary" fullWidth onClick={() => setStep({ kind: "offer" })}>Other ways to sign in</Button>
              </div>
            </Frame>
          )}

          {step.kind === "check" && (
            <CheckEmail reason={step.reason} email={step.email} created={step.created === true}
              // A verified sign-up signs in by itself once the person is back here.
              trySignIn={step.reason === "verify" ? () => loginWithEmail(step.email, password) : undefined}
              onChangeEmail={() => { setMode("create"); setStep({ kind: "offer" }) }}
              onBack={() => { setMode("signin"); setStep({ kind: "offer" }) }} />
          )}

          {step.kind === "forgot" && (
            <Forgot initialEmail={email} onSent={(to) => setStep({ kind: "check", reason: "reset", email: to })}
              onBack={() => setStep({ kind: "offer" })} />
          )}

          {step.kind === "done" && <Done spaces={spaces.length} tabs={tabs} provider={user?.provider} onBack={onBack} />}
        </section>
      </div>
    </Modal>
  )
}

/** One step: its content and, right after, its closing links, as one group.
 *  The content reads from the left like the form; the closing links (switch
 *  mode, go back, legal) sit centred under it, as on every sign-in screen. */
function Frame({ children, footer, status = false }: { children: React.ReactNode; footer?: React.ReactNode; status?: boolean }) {
  return (
    <div className="flex flex-col gap-5">
      <div role={status ? "status" : undefined} className="flex flex-col gap-5">{children}</div>
      {footer && <div className="flex flex-col items-center gap-2 text-center">{footer}</div>}
    </div>
  )
}

/** A step's heading: its mark, its title, what it means. Same place in every step. */
/** A step's head. With a mark it is a status (waiting, sent, closed, done) and
 *  sits centred, like a loading or result screen; without one it heads a form
 *  and reads from the left with the fields. */
function StepHead({ tile, title, children }: { tile?: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className={`flex flex-col gap-4 ${tile ? "items-center text-center" : ""}`}>
      {tile}
      <div className="flex flex-col gap-1.5">
        <h3 className="text-fg text-base font-semibold">{title}</h3>
        {children && <div className="flex flex-col gap-1.5 text-fg-muted text-sm leading-relaxed">{children}</div>}
      </div>
    </div>
  )
}

function Tile({ tone, children, spinning = false }: { tone: "accent" | "success" | "neutral"; children: React.ReactNode; spinning?: boolean }) {
  // A success tile marks a finished moment: it settles in once (TASK-96, style.css ft-done-tile).
  const look = tone === "success" ? "ft-done-tile bg-success/15 text-success" : tone === "neutral" ? "bg-ink/10 text-fg-muted" : "text-[var(--accent-text)]"
  return (
    <span className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${look}`} style={tone === "accent" ? { backgroundColor: "var(--accent-subtle)" } : undefined}>
      {spinning && <span aria-hidden className="absolute inset-0 rounded-full border-2 border-[var(--accent)] border-t-transparent motion-safe:animate-spin" />}
      {children}
    </span>
  )
}

/** Seconds left until another email may go to the address (0 = now). */
function useCooldown(initial: number) {
  const [until, setUntil] = useState(() => Date.now() + initial * 1000)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (until <= Date.now()) return
    const t = setInterval(() => {
      const n = Date.now()
      setNow(n)
      if (n >= until) clearInterval(t)
    }, 1000)
    return () => clearInterval(t)
  }, [until])
  return { left: Math.max(0, Math.ceil((until - now) / 1000)), start: (s: number) => { setUntil(Date.now() + s * 1000); setNow(Date.now()) } }
}

/** What went wrong, short enough for the form's one-line slot. */
function formProblem(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return "Wrong email or password."
    if (err.code === "weak_password") return "Use 8 to 72 characters."
    if (err.code === "invalid_email") return "Enter a valid email address."
    if (err.code === "email_throttled" && err.retryAfter) return `Email just sent. Ask again in ${err.retryAfter}s.`
    if (err.code === "email_unavailable") return "Email is off right now. Use Google or GitHub."
    if (err.status === 429) return "Too many tries. Wait a minute, then retry."
    if (err.status >= 500) return "FlexTab is busy. Try again in a moment."
  }
  if (err instanceof TypeError) return "Can't reach FlexTab. Check your connection."
  return err instanceof Error && err.message ? err.message : "Something went wrong. Try again."
}

function sendProblem(err: unknown, cooldown: (s: number) => void): string {
  if (err instanceof ApiError && err.status === 429 && err.retryAfter) cooldown(err.retryAfter)
  return formProblem(err)
}

/** An email link is on its way: say where, how long it may take, and offer a resend. */
function CheckEmail({ reason, email, created = false, trySignIn, onChangeEmail, onBack }: {
  reason: "verify" | "reset"
  email: string
  created?: boolean
  trySignIn?: () => Promise<void>
  onChangeEmail: () => void
  onBack: () => void
}) {
  const { left, start } = useCooldown(RESEND_SECONDS)
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)

  // Back from the email (the tab regains focus): try to sign in quietly.
  useEffect(() => {
    if (!trySignIn) return
    const attempt = () => { void trySignIn().catch(() => {}) }
    window.addEventListener("focus", attempt)
    return () => window.removeEventListener("focus", attempt)
  }, [trySignIn])

  const resend = async () => {
    setSending(true)
    setNote('')
    try {
      await (reason === "verify" ? apiResendVerification(email) : apiForgotPassword(email))
      start(RESEND_SECONDS)
      setNote("Sent again.")
    } catch (err) {
      setNote(sendProblem(err, start))
    } finally {
      setSending(false)
    }
  }
  const checkNow = async () => {
    if (!trySignIn) return
    setNote('')
    try {
      await trySignIn()
    } catch (err) {
      setNote(err instanceof ApiError && err.code === "email_unverified"
        ? "Not verified yet."
        : err instanceof Error ? err.message : "Couldn't sign in. Try again.")
    }
  }

  return (
    <Frame footer={
      <p className="text-fg-subtle text-xs">
        <TextLink onClick={reason === "verify" ? onChangeEmail : onBack}>
          {reason === "verify" ? "Use a different email" : "Try another email"}
        </TextLink>
      </p>
    }>
      {/* Just created: a finished moment (check + what is left to do). Otherwise still waiting on the mail. */}
      <StepHead tile={created ? <Tile tone="success"><DoneCheck /></Tile> : <Tile tone="accent"><Icon icon={Mail} size="md" /></Tile>}
        title={created ? "Account created" : "Check your email"}>
        <p>
          {created
            ? <>Open the link sent to <span className="text-fg break-all">{email}</span> to turn on sync.</>
            : reason === "verify"
            ? <>Link sent to <span className="text-fg break-all">{email}</span>.</>
            : <>If <span className="text-fg break-all">{email}</span> has an account, a reset link is on its way.</>}
        </p>
        <p className="text-fg-subtle text-xs">Not there? Check spam.</p>
      </StepHead>
      <div className="flex flex-col gap-2">
        {trySignIn
          ? <Button variant="default" fullWidth onClick={() => void checkNow()}>I've opened the link</Button>
          : <Button variant="default" fullWidth onClick={onBack}>Back to sign in</Button>}
        <Button variant="secondary" fullWidth disabled={left > 0 || sending} onClick={() => void resend()}>
          {sending ? "Sending…" : left > 0 ? `Resend email in ${left}s` : "Resend email"}
        </Button>
        <p role="status" className="h-4 truncate text-center text-fg-muted text-xs leading-4">{note}</p>
      </div>
    </Frame>
  )
}

/** Ask for the address to send a reset link to. */
function Forgot({ initialEmail, onSent, onBack }: { initialEmail: string; onSent: (email: string) => void; onBack: () => void }) {
  const [email, setEmail] = useState(initialEmail)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const access = requestApiAccess()
    setSending(true)
    setError('')
    try {
      if (!(await access)) { setError(NO_ACCESS); return }
      await apiForgotPassword(email.trim())
      onSent(email.trim())
    } catch (err) {
      setError(sendProblem(err, () => {}))
    } finally {
      setSending(false)
    }
  }
  return (
    <Frame footer={<TextLink tone="subtle" size="xs" onClick={onBack}>Back to sign in</TextLink>}>
      <StepHead title="Reset your password" />
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="forgot-email">Email</Label>
          <Input id="forgot-email" type="email" placeholder="you@example.com" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required
            aria-describedby={error ? "forgot-error" : undefined} />
        </div>
        <Button variant="default" type="submit" disabled={sending} fullWidth>{sending ? "Sending…" : "Send reset link"}</Button>
        <p id="forgot-error" role="alert" className="h-4 truncate text-danger text-xs leading-4">{error}</p>
      </form>
    </Frame>
  )
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`

/** The provider's tab is open: point back to it, and let the person stop. */
function Waiting({ provider, tabId, onCancel }: { provider: Provider; tabId: number; onCancel: () => void }) {
  const name = PROVIDER_NAME[provider]
  const openTab = () => {
    void chrome.tabs.update(tabId, { active: true }).then(t => { if (t?.windowId !== undefined) void chrome.windows.update(t.windowId, { focused: true }) }).catch(() => {})
  }
  const cancel = () => {
    // Closing the tab ends the attempt (the worker drops it on tab removal).
    void chrome.tabs.remove(tabId).catch(() => {})
    onCancel()
  }
  return (
    <Frame status>
      <StepHead tile={<Tile tone="accent" spinning><ProviderMark provider={provider} /></Tile>}
        title={`Finish in the ${name} tab`} />
      <div className="flex flex-col gap-2">
        <Button variant="secondary" fullWidth onClick={openTab}>Open the {name} tab</Button>
        <Button variant="ghost" fullWidth onClick={cancel}>Cancel</Button>
      </div>
    </Frame>
  )
}

/** Signed in: what happened to the tabs, and the step that makes sync worth it. */
function Done({ spaces, tabs, provider, onBack }: { spaces: number; tabs: number; provider?: string; onBack: () => void }) {
  const autoSync = useSettingsStore(s => s.autoSync)
  const lastSyncedAt = useSyncStore(s => s.lastSyncedAt)
  const [since] = useState(() => Date.now())
  const synced = lastSyncedAt !== null && lastSyncedAt >= since
  const detail = !autoSync
    ? "Auto-sync is off."
    : tabs === 0 ? "New saves are backed up."
    : synced ? `${plural(tabs, "tab")} backed up.`
    : `Backing up ${plural(tabs, "tab")}…`
  const account = PROVIDER_NAME[provider as Provider] ?? "your email"
  const copy = () => {
    void navigator.clipboard.writeText(LEGAL_BASE_URL).then(() => toast.success("Link copied"), () => toast.error("Couldn't copy the link"))
  }
  return (
    <Frame status>
      <StepHead tile={<Tile tone="success"><DoneCheck /></Tile>} title={autoSync ? "Sync is on" : "You're signed in"}>
        {detail}
      </StepHead>
      {/* The step that makes sync worth it, as a plain list under a rule: no box in a box. */}
      <div className="flex flex-col gap-3 border-t border-ink/10 pt-4">
        <h4 className="text-fg text-sm font-medium">Add your other computer</h4>
        <ol className="flex flex-col gap-3 text-sm">
          <li className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2.5 text-fg-muted"><Num n={1} />Install FlexTab</span>
            <Button variant="secondary" size="sm" onClick={copy}><Icon icon={Copy} size="sm" />Copy link</Button>
          </li>
          <li className="flex items-center gap-2.5 text-fg-muted"><Num n={2} />Sign in with {account}</li>
        </ol>
      </div>
      <Button variant="default" fullWidth onClick={onBack}>Go to my tabs</Button>
    </Frame>
  )
}

function Num({ n }: { n: number }) {
  return <span aria-hidden className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink/10 text-caption text-fg">{n}</span>
}
