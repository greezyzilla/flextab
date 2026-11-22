import { SignOutDialog } from "~src/components/SignOutDialog";
import { DeleteAccountDialog } from "~src/components/DeleteAccountDialog";
import { useState, useEffect, type FormEvent } from "react";
import { useAuthStore } from "~src/store/useAuthStore";
import {
  apiChangePassword, apiForgotPassword, apiGetSignInOptions, apiUpdateProfile, apiListIdentities, apiUnbindIdentity,
  apiGetBindUrl, apiGetAuthProviders, ApiError, type LinkedIdentity,
} from "~src/services/api";
import { ConfirmDialog } from "~src/components/ui/confirm-dialog";
import { Button } from "~src/components/ui/button";
import { Input } from "~src/components/ui/input";
import { Modal, ModalBody, ModalField, ModalFooter, ModalHeader } from "~src/components/ui/modal";
import { Label } from "~src/components/ui/label";
import { SettingRow, SettingsList, SettingsListRow, SettingsNotice, SettingsPage, SettingsSection } from "./shared";
import { DevicesList } from "./SyncTab";
import { ProviderMark } from "~src/components/OnboardingScreen";
import type { OAuthProvider } from "~src/services/oauthLogin";
import { Icon } from "~src/components/ui/icon";
import { DoneLine } from "~src/components/ui/done-check";
import { Mail, AtSign, Laptop, LogIn, MonitorSmartphone, ShieldAlert, TextCursorInput } from "lucide-react";
import { TextLink } from "~src/components/ui/text-link";

// --- Account Tab ---

// Providers that can be linked from the Account tab. Add a row here (+ BE config)
// to expose a new one.
const LINKABLE_PROVIDERS: { id: string; label: string }[] = [
  { id: 'google', label: 'Google' },
  { id: 'github', label: 'GitHub' },
  { id: 'gitlab', label: 'GitLab' },
  { id: 'discord', label: 'Discord' },
];

/**
 * Settings › Account › Profile (TASK-84): who you are here, and signing this
 * device out. Routine edits live here, away from sign-in methods and deletion.
 */
export function ProfileTab() {
  const { user, fetchUser } = useAuthStore();
  const [signOutOpen, setSignOutOpen] = useState(false);

  // Display name
  const [name, setName] = useState(user?.name ?? '');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  useEffect(() => { setName(user?.name ?? ''); }, [user?.name]);

  const handleSaveName = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === user?.name) return;
    setNameSaving(true);
    try {
      await apiUpdateProfile(trimmed);
      await fetchUser();
      setNameSaved(true);
      setTimeout(() => setNameSaved(false), 2000);
    } catch (_) { /* leave the field for a retry */ } finally {
      setNameSaving(false);
    }
  };

  return (
    <SettingsPage>
      <SignOutDialog open={signOutOpen} onOpenChange={setSignOutOpen} />
      <SettingsSection title="Signed in as" icon={AtSign} subtitle="The account this device uses.">
      <SettingsList label="Signed in as" empty={user ? undefined : { title: "Not signed in.", says: "Sign in to back up and sync your tabs across devices." }}>
        {user && (
          <SettingsListRow
            mark={user.avatar
              ? <img src={user.avatar} alt="" className="w-5 h-5 rounded-full" referrerPolicy="no-referrer" />
              : <span className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-medium" style={{ backgroundColor: 'var(--accent-fill)', color: 'var(--on-accent-fill)' }}>{(user.name || user.email).slice(0, 1).toUpperCase()}</span>}
            title={<span className="truncate">{user.name}</span>}
            meta={<span className="break-all">{user.email}</span>}
          />
        )}
      </SettingsList>
      </SettingsSection>

      <SettingsSection title="Name" icon={TextCursorInput} subtitle="How you appear across FlexTab.">
      <SettingRow label="Display name" description="Shown across FlexTab. Independent of your provider.">
        {(controlProps) => (
          <div className="flex items-center gap-2">
            <Input {...controlProps} value={name} onChange={e => setName(e.target.value)} maxLength={100} placeholder="e.g. Alex Rivera" className="flex-1 min-w-0" />
            <Button variant="secondary" size="sm" onClick={handleSaveName} disabled={nameSaving || !name.trim() || name.trim() === user?.name}>
              {nameSaving ? 'Saving…' : nameSaved ? 'Saved' : 'Save'}
            </Button>
          </div>
        )}
      </SettingRow>
      </SettingsSection>

      <SettingsSection title="This device" icon={Laptop} subtitle="Sign this device out of your account.">
      {/* Sign out is a row like the others, and neutral: it keeps this
          device's tabs by default. Red is left to the danger zone alone. */}
      <SettingRow label="Sign out" description="Signs this device out. Your account keeps everything that synced, and you choose what happens to the tabs here.">
        <Button variant="ghost" size="sm" onClick={() => setSignOutOpen(true)}>
          Sign out…
        </Button>
      </SettingRow>
      </SettingsSection>
    </SettingsPage>
  );
}

/**
 * Settings › Account › Sign-in & security (TASK-84): the ways into the
 * account, the password, and deleting the account as the last section
 * (a page visited rarely, so a sleepy click on Profile never lands near it).
 */
export function SecurityTab() {
  const { user } = useAuthStore();
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Linked sign-in methods
  // Until the list call returns, draw from what /api/me already said, so a
  // password-only account shows its warning from the first frame (TASK-41).
  const [listed, setListed] = useState<LinkedIdentity[] | null>(null);
  const [listedHasPassword, setListedHasPassword] = useState<boolean | null>(null);
  const identities = listed ?? user?.identities ?? null;
  const hasPassword = listedHasPassword ?? !!user?.has_password;
  const [linking, setLinking] = useState<string | null>(null);
  const [unlinking, setUnlinking] = useState<string | null>(null);
  const [idError, setIdError] = useState('');
  const [availableProviders, setAvailableProviders] = useState<string[] | null>(null);
  useEffect(() => { apiGetAuthProviders().then(setAvailableProviders).catch(() => setAvailableProviders([])); }, []);

  const loadIdentities = () => {
    apiListIdentities()
      .then(r => { setListed(r.identities); setListedHasPassword(r.has_password); })
      .catch(() => setListed(prev => prev ?? user?.identities ?? []));
  };
  useEffect(loadIdentities, []);

  // A provider-link (bind) OAuth round-trip finishes in a separate tab; the
  // background writes a result flag — refresh the list + surface any error.
  useEffect(() => {
    const onChange = (changes: { [k: string]: chrome.storage.StorageChange }, area: string) => {
      if (area !== 'local' || !changes['flextab_bind_result']?.newValue) return;
      const v = changes['flextab_bind_result'].newValue as { error?: string | null };
      setIdError(v.error === 'taken' ? 'That account is already linked to a different FlexTab account.' : v.error ? 'Linking failed.' : '');
      setLinking(null);
      loadIdentities();
      try { void chrome.storage.local.remove('flextab_bind_result'); } catch (_) { /* ok */ }
    };
    try { chrome.storage?.onChanged?.addListener(onChange); } catch (_) { /* ok */ }
    return () => { try { chrome.storage?.onChanged?.removeListener(onChange); } catch (_) { /* ok */ } };
  }, []);

  const handleLink = async (provider: string) => {
    setLinking(provider);
    setIdError('');
    try {
      chrome.tabs.create({ url: await apiGetBindUrl(provider) });
      // Completion (or error) arrives via the bind-result storage listener.
    } catch (_) {
      setLinking(null);
      setIdError("Couldn't start linking.");
    }
  };

  const handleUnlink = async (provider: string) => {
    setUnlinking(provider);
    setIdError('');
    try {
      await apiUnbindIdentity(provider);
      loadIdentities();
    } catch (err) {
      setIdError(err instanceof ApiError && err.status === 409
        ? "Can't unlink your only sign-in method. Set a password or link another provider first."
        : "Couldn't unlink that provider.");
    } finally {
      setUnlinking(null);
    }
  };

  // One row per provider, linked or not, so linking changes what a row says and
  // never the shape of the list. A provider the server has not configured is
  // left out unless it is already linked.
  const providerRows = identities && availableProviders
    ? [
        ...LINKABLE_PROVIDERS
          .map(p => ({ ...p, identity: identities.find(i => i.provider === p.id) }))
          .filter(p => p.identity || availableProviders.includes(p.id)),
        ...identities
          .filter(i => !LINKABLE_PROVIDERS.some(p => p.id === i.provider))
          .map(i => ({ id: i.provider, label: i.provider, identity: i })),
      ]
    : null;
  // The placeholder holds as many rows as will arrive: the configured providers
  // once the server said which, the two most common (Google, GitHub) before.
  const placeholderRows = availableProviders
    ? LINKABLE_PROVIDERS.filter(p => availableProviders.includes(p.id))
    : LINKABLE_PROVIDERS.slice(0, 2);

  // --- Password ---
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  // The form opens in a modal, so opening it never pushes the rest of the page down.
  const [pwOpen, setPwOpen] = useState(false);
  const closePassword = () => { setPwOpen(false); setPwError(''); setCurrentPw(''); setNewPw(''); setConfirmPw(''); setResetSent(''); };
  // Forgot the current password (TASK-87): the same reset link as the sign-in screen, sent to this
  // account's address. Offered only while the server can send email.
  const [resetSent, setResetSent] = useState('');
  const [emailOn, setEmailOn] = useState(false);
  useEffect(() => {
    if (!pwOpen || !hasPassword) return;
    apiGetSignInOptions().then(o => setEmailOn(o.emailSignup)).catch(() => setEmailOn(false));
  }, [pwOpen, hasPassword]);
  const sendReset = async () => {
    if (!user?.email || pwLoading) return;
    setPwError('');
    setPwLoading(true);
    try {
      await apiForgotPassword(user.email);
      setResetSent(user.email);
    } catch (err: unknown) {
      setPwError(err instanceof ApiError && err.code === 'email_throttled' && err.retryAfter
        ? `A link was just sent. Ask again in ${err.retryAfter}s.`
        : 'Could not send the link. Try again.');
    } finally {
      setPwLoading(false);
    }
  };

  const handleChangePassword = async (e?: FormEvent) => {
    e?.preventDefault();
    if (pwLoading) return;
    setPwError('');
    setPwSuccess('');
    if (newPw.length < 8) { setPwError('Password must be at least 8 characters'); return; }
    if (newPw !== confirmPw) { setPwError('Passwords do not match'); return; }
    setPwLoading(true);
    try {
      await apiChangePassword(currentPw, newPw);
      setPwSuccess('Password updated. Sign in again to continue.');
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      setPwOpen(false);
      loadIdentities(); // Let the API handle the revoked session without clearing local spaces.
    } catch (err: unknown) {
      setPwError(err instanceof Error ? err.message : 'Failed to update password');
    } finally {
      setPwLoading(false);
    }
  };

  return (
    <SettingsPage>
      <DeleteAccountDialog open={deleteOpen} onOpenChange={setDeleteOpen} />
      <SettingsSection
        title="Sign-in methods"
        icon={LogIn}
        subtitle="The ways you can get into your account."
        notice={idError ? <SettingsNotice tone="warning">{idError}</SettingsNotice>
          // A password-only account has one way in. A reset by email exists when
          // the server can send email (TASK-79), but a linked provider is a second
          // way in that never depends on a mailbox.
          : identities?.length === 0 && hasPassword ? <SettingsNotice tone="warning">Only a password gets you into this account. Link Google or GitHub as a second way in.</SettingsNotice>
          : undefined}
      >
      <SettingsList label="Sign-in methods" busyLabel={providerRows === null ? "Loading sign-in methods" : undefined}>
      {providerRows === null ? (
        // Same rows, same height, until the list arrives.
        placeholderRows.map(p => (
          <SettingsListRow
            key={p.id}
            placeholder
            mark={<ProviderMark provider={p.id as OAuthProvider} />}
            title={<span className="flex h-5 items-center"><span className="h-3.5 w-16 rounded bg-ink/[0.07] motion-safe:animate-pulse" /></span>}
            meta={<span className="flex h-4 items-center"><span className="h-3 w-32 rounded bg-ink/[0.05] motion-safe:animate-pulse" /></span>}
          />
        ))
      ) : providerRows.map(p => (
        <SettingsListRow
          key={p.id}
          mark={<ProviderMark provider={p.id as OAuthProvider} />}
          title={p.label}
          meta={p.identity ? (p.identity.email || 'Linked') : 'Not linked'}
          action={p.identity ? (
            // Same quiet shape as Link: removing a way in is routine, and the
            // server refuses to remove the last one (TASK-84 §4).
            <Button variant="ghost" size="sm" onClick={() => handleUnlink(p.id)} disabled={unlinking === p.id} aria-label={`Unlink ${p.label}`}>
              {unlinking === p.id ? 'Unlinking…' : 'Unlink'}
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => handleLink(p.id)} disabled={linking === p.id} aria-label={`Link ${p.label}`}>
              {linking === p.id ? 'Opening…' : 'Link'}
            </Button>
          )}
        />
      ))}
      {/* Password: one more way in; the form opens in a modal. */}
      <SettingsListRow
        mark={<Icon icon={Mail} size="sm" />}
        title="Email and password"
        meta={<>
          {hasPassword
            ? 'Changing it signs out all devices.'
            : `Not set. Lets you sign in with ${user?.email ?? 'your email'} too; setting one signs out all devices.`}
          {pwSuccess && <DoneLine className="mt-0.5">{pwSuccess}</DoneLine>}
        </>}
        action={
          <Button variant="ghost" size="sm" onClick={() => { setPwSuccess(''); setPwOpen(true); }}>
            {hasPassword ? 'Change password…' : 'Add a password…'}
          </Button>
        }
      />
      </SettingsList>
      <Modal kind="dialog" size="m" open={pwOpen} onOpenChange={o => { if (!o && !pwLoading) closePassword(); }}
        dirty={!!(currentPw || newPw || confirmPw)}>
        <ModalHeader title={resetSent ? 'Check your email' : hasPassword ? 'Change password' : 'Add a password'}
          description={resetSent
            ? <>A reset link is on its way to <span className="text-fg">{resetSent}</span>.</>
            : hasPassword
            ? 'Changing it signs out all devices.'
            : `Lets you sign in with ${user?.email ?? 'your email'} too. Setting one signs out all devices.`} />
        {!resetSent && <ModalBody>
          {/* Enter in any field submits, as the footer button is outside the form. */}
          <form onSubmit={handleChangePassword} onKeyDown={e => { if (e.key === 'Enter' && e.target instanceof HTMLInputElement) { e.preventDefault(); void handleChangePassword(); } }}
            className="flex flex-col gap-4">
            {hasPassword && (
              // "Forgot it?" beside the label, like "Forgot password?" on the sign-in screen.
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="account-current-password">Current password</Label>
                  {emailOn && (
                    <TextLink tone="subtle" size="caption" disabled={pwLoading} onClick={() => void sendReset()}>Forgot it?</TextLink>
                  )}
                </div>
                <Input id="account-current-password" type="password" placeholder="Enter your current password" autoComplete="current-password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} />
              </div>
            )}
            <ModalField label="New password" htmlFor="account-new-password">
              <Input id="account-new-password" type="password" placeholder="At least 8 characters" autoComplete="new-password" value={newPw} onChange={e => setNewPw(e.target.value)} minLength={8} required />
            </ModalField>
            <ModalField label="Confirm new password" htmlFor="account-confirm-password">
              <Input id="account-confirm-password" type="password" placeholder="Enter the new password again" autoComplete="new-password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} minLength={8} required />
            </ModalField>
            {pwError && <div role="alert" className="text-danger text-xs">{pwError}</div>}
          </form>
        </ModalBody>}
        {resetSent ? <ModalFooter cancel={false} primary={{ label: 'Done', onClick: closePassword }} /> :
        <ModalFooter cancelDisabled={pwLoading} primary={{
          label: pwLoading ? 'Saving…' : hasPassword ? 'Update password' : 'Set password',
          disabled: pwLoading,
          onClick: () => void handleChangePassword(),
        }} />}
      </Modal>

      {/* Same danger zone as Settings › Spaces (TASK-17): last, under its own heading. */}
      </SettingsSection>
      <SettingsSection title="Devices" icon={MonitorSmartphone} subtitle="Where your account is signed in.">
        <DevicesList />
      </SettingsSection>
      <SettingsSection title="Danger zone" icon={ShieldAlert} subtitle="Delete your account and its cloud data.">
        <SettingRow label="Delete account" description="Deletes your account and its cloud data." info="Deletes your account and its cloud data on every device. Tabs on this device can stay.">
          <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>
            Delete account…
          </Button>
        </SettingRow>
      </SettingsSection>
    </SettingsPage>
  );
}
