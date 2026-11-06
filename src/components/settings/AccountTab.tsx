import { SignOutDialog } from "~src/components/SignOutDialog";
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
import { SettingRow, GroupHeading } from "./shared";

// --- Account Tab ---

// Providers that can be linked from the Account tab. Add a row here (+ BE config)
// to expose a new one.
const LINKABLE_PROVIDERS: { id: string; label: string }[] = [
  { id: 'google', label: 'Google' },
  { id: 'github', label: 'GitHub' },
];

export function AccountTab() {
  const { user, fetchUser } = useAuthStore();

  const [signOutOpen, setSignOutOpen] = useState(false);

  // Display name
  const [name, setName] = useState(user?.name ?? '');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  useEffect(() => { setName(user?.name ?? ''); }, [user?.name]);

  // Linked sign-in methods
  const [identities, setIdentities] = useState<LinkedIdentity[] | null>(null);
  const [hasPassword, setHasPassword] = useState<boolean>(!!user?.has_password);
  const [linking, setLinking] = useState<string | null>(null);
  const [unlinking, setUnlinking] = useState<string | null>(null);
  const [idError, setIdError] = useState('');
  const [availableProviders, setAvailableProviders] = useState<string[] | null>(null);
  useEffect(() => { apiGetAuthProviders().then(setAvailableProviders).catch(() => setAvailableProviders([])); }, []);

  const loadIdentities = () => {
    apiListIdentities()
      .then(r => { setIdentities(r.identities); setHasPassword(r.has_password); })
      .catch(() => setIdentities([]));
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

  const linkedProviders = new Set((identities ?? []).map(i => i.provider));
  // Only offer to link providers the server has configured and aren't linked yet.
  const unlinkable = LINKABLE_PROVIDERS.filter(p => !linkedProviders.has(p.id) && availableProviders?.includes(p.id));

  // --- Password ---
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPwError('');
    setPwSuccess('');
    if (newPw.length < 8) { setPwError('Password must be at least 8 characters'); return; }
    if (newPw !== confirmPw) { setPwError('Passwords do not match'); return; }
    setPwLoading(true);
    try {
      await apiChangePassword(currentPw, newPw);
      setPwSuccess('Password updated. Sign in again to continue.');
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
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
      {/* Profile */}
      <SettingRow label="Profile" description="Your FlexTab account.">
        {user && (
          <div className="flex items-center gap-3">
            {user.avatar ? (
              <img src={user.avatar} alt={user.name} className="w-9 h-9 rounded-full" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-white/85 text-sm font-medium" style={{ backgroundColor: 'var(--accent)' }}>
                {(user.name || user.email).slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="flex flex-col min-w-0">
              <span className="text-white/80 text-sm font-sans truncate">{user.name}</span>
              <span className="text-white/30 text-xs font-sans truncate">{user.email}</span>
            </div>
          </div>
        )}
      </SettingRow>

      {/* Display name */}
      <SettingRow label="Display name" description="Shown across FlexTab. Independent of your provider.">
        <div className="flex items-center gap-2">
          <Input value={name} onChange={e => setName(e.target.value)} maxLength={100} placeholder="Your name" className="flex-1 min-w-0" />
          <Button variant="secondary" size="sm" onClick={handleSaveName} disabled={nameSaving || !name.trim() || name.trim() === user?.name}>
            {nameSaving ? 'Saving…' : nameSaved ? 'Saved' : 'Save'}
          </Button>
        </div>
      </SettingRow>

      {/* Sign-in methods */}
      <SettingRow label="Sign-in methods" description="Providers linked to your account. Link more or remove ones you don't use.">
        <div className="flex flex-col gap-2">
          {idError && <div className="text-red-400 text-xs font-sans">{idError}</div>}
          {identities === null && <div className="text-white/30 text-xs font-sans">Loading…</div>}
          {identities?.map(id => (
            <div key={id.provider} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/[0.08] bg-white/[0.02] px-4 py-3">
              <div className="flex flex-wrap items-center gap-2 min-w-0 max-w-full">
                <span className="text-white/75 text-sm font-sans capitalize">{id.provider}</span>
                {id.email && <span className="text-white/30 text-xs font-sans truncate">{id.email}</span>}
              </div>
              <Button variant="ghost" size="sm" onClick={() => handleUnlink(id.provider)} disabled={unlinking === id.provider} className="!text-red-400/70 hover:!text-red-400">
                {unlinking === id.provider ? 'Unlinking…' : 'Unlink'}
              </Button>
            </div>
          ))}
          {identities && unlinkable.map(p => (
            <Button key={p.id} variant="secondary" size="sm" onClick={() => handleLink(p.id)} disabled={linking === p.id} className="self-start">
              {linking === p.id ? 'Opening…' : `Link ${p.label}`}
            </Button>
          ))}
        </div>
      </SettingRow>

      {/* Password */}
      <SettingRow
        label={hasPassword ? 'Change password' : 'Set password'}
        description={hasPassword ? 'Changing your password signs out all devices.' : 'Add email sign-in. Setting a password signs out all devices.'}
      >
        <form onSubmit={handleChangePassword} className="flex flex-col gap-2.5">
          {!hasPassword && (
            <p className="text-white/30 text-xs leading-relaxed">
              Adding a password lets you sign in with {user?.email ?? 'your email'} too. Your linked providers keep working.
            </p>
          )}
          {hasPassword && (
            <Input type="password" placeholder="Current password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} className="w-full" />
          )}
          <Input type="password" placeholder="New password" value={newPw} onChange={e => setNewPw(e.target.value)} className="w-full" minLength={8} required />
          <Input type="password" placeholder="Confirm new password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} className="w-full" minLength={8} required />
          {pwError && <div className="text-red-400 text-xs">{pwError}</div>}
          {pwSuccess && <div className="text-green-400 text-xs">{pwSuccess}</div>}
          <Button variant="default" size="sm" type="submit" disabled={pwLoading} className="self-start">
            {pwLoading ? 'Saving…' : hasPassword ? 'Update password' : 'Set password'}
          </Button>
        </form>
      </SettingRow>

      {/* Sign out */}
      <div className="pt-2 border-t border-white/5">
        <Button variant="link" onClick={() => setSignOutOpen(true)} className="!text-sm !text-red-400/70 hover:!text-red-400">
          Sign out
        </Button>
      </div>
    </div>
  );
}

// --- Data Tab ---

