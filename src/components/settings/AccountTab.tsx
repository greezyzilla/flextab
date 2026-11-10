import { SignOutDialog } from "~src/components/SignOutDialog";
import { DeleteAccountDialog } from "~src/components/DeleteAccountDialog";
import { useState, useEffect, type FormEvent } from "react";
import { useAuthStore } from "~src/store/useAuthStore";
import {
  apiChangePassword, apiUpdateProfile, apiListIdentities, apiUnbindIdentity,
  apiGetBindUrl, apiGetAuthProviders, ApiError, type LinkedIdentity,
} from "~src/services/api";
import { ConfirmDialog } from "~src/components/ui/confirm-dialog";
import { Button } from "~src/components/ui/button";
import { Input } from "~src/components/ui/input";
import { Badge } from "~src/components/ui/badge";
import { Modal, ModalBody, ModalField, ModalFooter, ModalHeader } from "~src/components/ui/modal";
import { SettingRow, GroupHeading } from "./shared";

// --- Account Tab ---

// Providers that can be linked from the Account tab. Add a row here (+ BE config)
// to expose a new one.
const LINKABLE_PROVIDERS: { id: string; label: string }[] = [
  { id: 'google', label: 'Google' },
  { id: 'github', label: 'GitHub' },
];

const PROVIDER_ROW = "flex items-center justify-between gap-3 rounded-lg border border-ink/[0.08] bg-ink/[0.02] px-4 py-3";

export function AccountTab() {
  const { user, fetchUser } = useAuthStore();

  const [signOutOpen, setSignOutOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Display name
  const [name, setName] = useState(user?.name ?? '');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  useEffect(() => { setName(user?.name ?? ''); }, [user?.name]);

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

  // --- Password ---
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  // The form opens in a modal, so opening it never pushes the rest of the page down.
  const [pwOpen, setPwOpen] = useState(false);
  const closePassword = () => { setPwOpen(false); setPwError(''); setCurrentPw(''); setNewPw(''); setConfirmPw(''); };

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
    <div className="flex flex-col gap-7">
      <SignOutDialog open={signOutOpen} onOpenChange={setSignOutOpen} />
      <DeleteAccountDialog open={deleteOpen} onOpenChange={setDeleteOpen} />
      {/* Profile */}
      <SettingRow label="Profile" description="Your FlexTab account.">
        {user && (
          <div className="flex items-center gap-3">
            {user.avatar ? (
              <img src={user.avatar} alt={user.name} className="w-9 h-9 rounded-full" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium" style={{ backgroundColor: 'var(--accent-fill)', color: 'var(--on-accent-fill)' }}>
                {(user.name || user.email).slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="flex flex-col min-w-0">
              <span className="text-fg text-sm font-sans truncate">{user.name}</span>
              <span className="text-fg-subtle text-xs font-sans truncate">{user.email}</span>
            </div>
          </div>
        )}
      </SettingRow>

      {/* Display name */}
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

      {/* Sign-in methods */}
      <SettingRow label="Sign-in methods" description="Providers linked to your account. Link more or remove ones you don't use.">
        <div className="flex flex-col gap-2">
          {idError && <div className="text-danger text-xs font-sans">{idError}</div>}
          {/* A password-only account has no way back in if the password is lost:
              FlexTab sends no email, so there is no reset (TASK-8). */}
          {identities?.length === 0 && hasPassword && (
            <p role="note" className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-warning-body text-xs font-sans leading-relaxed">
              Only a password protects this account, and FlexTab can't reset it. Link Google or GitHub so you can always get back in.
            </p>
          )}
          {providerRows === null ? (
            // Same rows, same height, until the list arrives.
            <div role="status" aria-label="Loading sign-in methods" className="flex flex-col gap-2">
              {LINKABLE_PROVIDERS.map(p => (
                <div key={p.id} aria-hidden className={PROVIDER_ROW}>
                  {/* Bars sit in boxes the height of the text lines they stand for. */}
                  <div className="flex flex-col gap-0.5">
                    <span className="flex h-5 items-center"><span className="h-3.5 w-16 rounded bg-ink/[0.07] motion-safe:animate-pulse" /></span>
                    <span className="flex h-4 items-center"><span className="h-3 w-32 rounded bg-ink/[0.05] motion-safe:animate-pulse" /></span>
                  </div>
                  <span className="h-8 w-16 rounded-md bg-ink/[0.05] motion-safe:animate-pulse" />
                </div>
              ))}
            </div>
          ) : providerRows.map(p => (
            <div key={p.id} className={PROVIDER_ROW}>
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-fg text-sm font-sans capitalize">{p.label}</span>
                <span className="text-fg-subtle text-xs font-sans truncate">
                  {p.identity ? (p.identity.email || 'Linked') : 'Not linked'}
                </span>
              </div>
              {p.identity ? (
                <Button variant="ghost" size="sm" onClick={() => handleUnlink(p.id)} disabled={unlinking === p.id} className="!text-danger hover:!text-danger-strong">
                  {unlinking === p.id ? 'Unlinking…' : 'Unlink'}
                </Button>
              ) : (
                <Button variant="secondary" size="sm" onClick={() => handleLink(p.id)} disabled={linking === p.id} aria-label={`Link ${p.label}`}>
                  {linking === p.id ? 'Opening…' : 'Link'}
                </Button>
              )}
            </div>
          ))}
        </div>
      </SettingRow>

      {/* Password: one line; the form opens in a modal. */}
      <SettingRow
        label="Password"
        description={hasPassword
          ? 'You can sign in with your email and password. Changing it signs out all devices.'
          : `Optional. Lets you sign in with ${user?.email ?? 'your email'} too; your linked providers keep working. Setting one signs out all devices.`}
      >
        <div className="flex flex-col gap-2">
          <Button variant="secondary" size="sm" className="self-start" onClick={() => { setPwSuccess(''); setPwOpen(true); }}>
            {hasPassword ? 'Change password…' : 'Add a password…'}
          </Button>
          {pwSuccess && <div role="status" className="text-success text-xs">{pwSuccess}</div>}
        </div>
      </SettingRow>
      <Modal kind="dialog" size="m" open={pwOpen} onOpenChange={o => { if (!o && !pwLoading) closePassword(); }}
        dirty={!!(currentPw || newPw || confirmPw)}>
        <ModalHeader title={hasPassword ? 'Change password' : 'Add a password'}
          description={hasPassword
            ? 'Changing it signs out all devices.'
            : `Lets you sign in with ${user?.email ?? 'your email'} too. Setting one signs out all devices.`} />
        <ModalBody>
          {/* Enter in any field submits, as the footer button is outside the form. */}
          <form onSubmit={handleChangePassword} onKeyDown={e => { if (e.key === 'Enter' && e.target instanceof HTMLInputElement) { e.preventDefault(); void handleChangePassword(); } }}
            className="flex flex-col gap-4">
            {hasPassword && (
              <ModalField label="Current password" htmlFor="account-current-password">
                <Input id="account-current-password" type="password" placeholder="Enter your current password" autoComplete="current-password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} className="w-full" />
              </ModalField>
            )}
            <ModalField label="New password" htmlFor="account-new-password">
              <Input id="account-new-password" type="password" placeholder="At least 8 characters" autoComplete="new-password" value={newPw} onChange={e => setNewPw(e.target.value)} className="w-full" minLength={8} required />
            </ModalField>
            <ModalField label="Confirm new password" htmlFor="account-confirm-password">
              <Input id="account-confirm-password" type="password" placeholder="Enter the new password again" autoComplete="new-password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} className="w-full" minLength={8} required />
            </ModalField>
            {pwError && <div role="alert" className="text-danger text-xs">{pwError}</div>}
          </form>
        </ModalBody>
        <ModalFooter cancelDisabled={pwLoading} primary={{
          label: pwLoading ? 'Saving…' : hasPassword ? 'Update password' : 'Set password',
          disabled: pwLoading,
          onClick: () => void handleChangePassword(),
        }} />
      </Modal>

      {/* Sign out is a row like the others, and neutral: it keeps this
          device's tabs by default. Red is left to the danger zone alone. */}
      <SettingRow label="Sign out" description="Signs this device out. Your account keeps everything that synced, and you choose what happens to the tabs here.">
        <Button variant="secondary" size="sm" onClick={() => setSignOutOpen(true)} className="self-start">
          Sign out…
        </Button>
      </SettingRow>

      {/* Same danger zone as Settings › Spaces (TASK-17): last, set apart, red. */}
      <section className="flex flex-col gap-3 border-t border-ink/10 pt-6" aria-labelledby="account-danger-heading">
        <h3 id="account-danger-heading" className="text-fg-subtle text-[11px] font-medium font-sans uppercase tracking-wider">Danger zone</h3>
        <div className="flex items-start justify-between gap-4 rounded-lg border border-red-400/25 p-4">
          <div className="min-w-0">
            <div className="text-sm font-sans font-medium text-fg">Delete account</div>
            <p className="mt-0.5 text-xs font-sans leading-relaxed text-fg-subtle">
              Deletes your account and its cloud data on every device. Tabs on this device can stay.
            </p>
          </div>
          <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
            Delete account…
          </Button>
        </div>
      </section>
    </div>
  );
}

// --- Data Tab ---

