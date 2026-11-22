import { clearKeptOnSignOut, markKeptOnSignOut } from "~src/services/keptWorkspace";
import { toast } from "sonner";
import { cancelPendingOAuth, OAUTH_START, type OAuthProvider } from "~src/services/oauthLogin";
import { RESOLUTION_PUSH_KEY, withSyncWriteLock } from "~src/services/syncPolicy";
import { create } from "zustand";
import { loadTokens, saveTokens, clearTokens, apiFetch, apiLogin, apiLogout, apiDeleteAccount, ApiError, type LinkedIdentity } from "~src/services/api";
import { clearState } from "~src/lib/yjsDoc";
import { resetYjsHydration } from "~src/store/useSavedSpacesStore";
import { clearStoredRevision } from "~src/services/revision";
import { LANDED_SNAPSHOT_KEY } from "~src/services/landedSnapshot";
import { clearMergeBase } from "~src/services/mergeBase";
import { clearConflictPending } from "~src/services/conflictState";
import { LIMIT_NOTICE_KEY } from "~src/services/syncLimit";
import type { TokenData } from "~src/services/api";

const SYNC_HYDRATED_KEY = "flextab_sync_hydrated";
const FRESH_LOGIN_KEY = "flextab_fresh_login";

export interface User {
  id: string;
  email: string;
  name: string;
  avatar: string;
  provider: string;
  has_password: boolean;
  /** Linked providers, sent with /api/me so Account can draw them before its own list call. */
  identities?: LinkedIdentity[];
}

// Guest mode lets users try the app fully (local-only) before signing in.
// Persisted to chrome.storage.local so it survives reloads and syncs across tabs
// via the onChanged listener below. Auth always wins: signing in clears it.
// Guest mode is gone (TASK-7): the workspace is always local, an account only
// adds sync. The old flag is removed once so it does not linger in storage.
const LEGACY_GUEST_MODE_KEY = "flextab_guest_mode";

/**
 * The signed-in account's profile, kept on this device (TASK-105) so the new tab and the popup open
 * from it at once instead of waiting for /api/me. Written on every /api/me, removed on sign-out,
 * account delete and a new login, so it always belongs to the stored tokens.
 */
export const STORED_USER_KEY = "flextab_user";

async function loadStoredUser(): Promise<User | null> {
  try {
    const got = await chrome.storage.local.get(STORED_USER_KEY);
    const u = got?.[STORED_USER_KEY];
    return u && typeof u.id === "string" ? (u as User) : null;
  } catch (_) { return null; }
}

async function storeUser(user: User): Promise<void> {
  try { await chrome.storage.local.set({ [STORED_USER_KEY]: user }); } catch (_) { /* ok */ }
}

/** Bumped whenever the session changes hands (login, sign-out, delete), so an older /me answer is dropped. */
let session = 0;

async function forgetStoredUser(): Promise<void> {
  try { await chrome.storage.local.remove(STORED_USER_KEY); } catch (_) { /* ok */ }
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  initialize: () => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  loginWithGithub: () => Promise<void>;
  loginWithGitlab: () => Promise<void>;
  loginWithDiscord: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  handleAuthCallback: (tokens: TokenData, alreadyStored?: boolean) => Promise<void>;
  /**
   * Sign out. "keep" leaves this device's workspace in place as a local-only
   * workspace (TASK-7): the next sign-in, to any account, reconciles it through
   * the same guest→account path as a first login. "remove" also deletes it.
   */
  logout: (choice: { localData: "keep" | "remove" }) => Promise<void>;
  /**
   * Delete the account and its cloud data (TASK-17), then leave this device
   * signed out like a sign-out does, keeping or removing its tabs as chosen.
   */
  deleteAccount: (email: string, choice: { localData: "keep" | "remove" }) => Promise<void>;
  fetchUser: () => Promise<void>;
}

async function requestOAuthLogin(provider: OAuthProvider): Promise<void> {
  try {
    const result = await chrome.runtime.sendMessage({ type: OAUTH_START, provider });
    if (!result?.ok) throw new Error("Sign-in could not start. Please try again.");
  } catch (_) { toast.error("Sign-in could not start. Please try again."); }
}


/**
 * What signing out (or deleting the account) leaves on this device: no tokens,
 * no per-account sync state, and the tabs kept or removed as chosen.
 */
async function forgetAccountHere(localData: "keep" | "remove"): Promise<void> {
  session++;
  await clearTokens();
  await forgetStoredUser();
  if (localData === "remove") {
    await clearState();
    resetYjsHydration();
    await clearKeptOnSignOut();
  } else {
    // The next sign-in, to any account, must ask before these tabs go anywhere.
    await markKeptOnSignOut();
  }
  await clearStoredRevision();
  // The merge base is per-account, so it belongs here (real, explicit
  // sign-out) — not in stopSyncEngine's generic pause path, which also runs
  // on a transient auth drop (e.g. the refresh-token race) where the base
  // must survive so re-login doesn't manufacture a false merge conflict.
  // A kept workspace has no base afterwards: the next sign-in treats it as
  // local work and reconciles it explicitly, whichever account it is.
  await clearMergeBase();
  await clearConflictPending(); // per-account, like the merge base
  const keys = [SYNC_HYDRATED_KEY, FRESH_LOGIN_KEY, LANDED_SNAPSHOT_KEY, LIMIT_NOTICE_KEY, RESOLUTION_PUSH_KEY]; // the limit is per-account too, and so is an unsent resolution
  if (localData === "remove") keys.push("spaces");
  try { await chrome.storage.local.remove(keys); } catch (_) { /* ok */ }
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  initialize: async () => {
    const tokens = await loadTokens();
    if (tokens) {
      // Local-first (TASK-105): with the profile stored on this device, open from it at once and
      // refresh it from /api/me in the background. Only the first open after a sign-in waits.
      const stored = await loadStoredUser();
      set(stored ? { isAuthenticated: true, user: stored, isLoading: false } : { isAuthenticated: true });
      const refresh = get().fetchUser().catch(async (err) => {
        // Only a real auth rejection signs out (401: the BE rejected the token, which clears it).
        // A network error or the BE being down keeps the session, so the app works offline.
        if (err instanceof ApiError && err.status === 401) {
          await forgetStoredUser();
          set({ isAuthenticated: false, user: null });
        }
      });
      if (!stored) await refresh;
    }
    try { void chrome.storage.local.remove(LEGACY_GUEST_MODE_KEY); } catch (_) { /* ok */ }
    set({ isLoading: false });
  },

  loginWithGoogle: () => requestOAuthLogin("google"),

  loginWithGithub: () => requestOAuthLogin("github"),

  loginWithGitlab: () => requestOAuthLogin("gitlab"),

  loginWithDiscord: () => requestOAuthLogin("discord"),

  loginWithEmail: async (email: string, password: string) => {
    const tokens = await apiLogin(email, password);
    await get().handleAuthCallback(tokens);
  },

  handleAuthCallback: async (tokens: TokenData, alreadyStored = false) => {
    const accepted = await withSyncWriteLock(async () => {
      if (alreadyStored) {
        // A delayed storage event must not write an older session over a newer
        // email/OAuth login. Reload this context's cache instead of re-saving.
        const latest = await loadTokens();
        if (!latest || latest.access_token !== tokens.access_token || latest.refresh_token !== tokens.refresh_token) return false;
      } else {
        await cancelPendingOAuth();
        await saveTokens(tokens);
      }
      // Preserve local work for the existing explicit sync reconciliation flow.
      await clearStoredRevision();
      try { await chrome.storage.local.set({ [FRESH_LOGIN_KEY]: true }); } catch (_) { /* ok */ }
      try { await chrome.storage.local.remove([SYNC_HYDRATED_KEY, LIMIT_NOTICE_KEY]); } catch (_) { /* ok */ }
      // Invalidate the previous identity before releasing the login lock.
      // Account-bound work must wait for /me for the newly accepted tokens.
      session++;
      await forgetStoredUser();
      set({ isAuthenticated: true, user: null });
      return true;
    });
    if (accepted) await get().fetchUser();
  },

  logout: async (choice) => {
    // Fail closed for stale callers (including an onClick MouseEvent): what
    // happens to local data is always an explicit choice from the sign-out dialog.
    const localData = choice?.localData;
    if (localData !== "keep" && localData !== "remove") throw new Error("Choose what happens to local data before signing out");
    await withSyncWriteLock(async () => {
      await cancelPendingOAuth();
      // Drain an in-flight sync before clearing its revision/receipt.
      // Revoke the refresh token server-side before dropping it locally.
      await apiLogout();
      await forgetAccountHere(localData);
      set({ user: null, isAuthenticated: false });
    });
  },

  deleteAccount: async (email, choice) => {
    const localData = choice?.localData;
    if (localData !== "keep" && localData !== "remove") throw new Error("Choose what happens to local data before deleting the account");
    await withSyncWriteLock(async () => {
      await cancelPendingOAuth();
      // The server revokes every session of the account; a failure here leaves
      // the account and this device untouched.
      await apiDeleteAccount(email);
      await forgetAccountHere(localData);
      set({ user: null, isAuthenticated: false });
    });
  },

  fetchUser: async () => {
    const asked = session;
    const user = await apiFetch<User>("/api/me");
    // A sign-out or a new login while /me was in flight must not get this profile back.
    if (asked !== session || !get().isAuthenticated) return;
    set({ user });
    await storeUser(user);
  },
}));

// Listen for token changes in chrome.storage (set by background script or callback tab)
if (chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (changes.auth_tokens) {
      const { isAuthenticated } = useAuthStore.getState();
      if (changes.auth_tokens.newValue && !isAuthenticated) {
        useAuthStore.getState().handleAuthCallback(changes.auth_tokens.newValue, true).catch(() => {});
      } else if (!changes.auth_tokens.newValue && isAuthenticated) {
        session++;
        useAuthStore.setState({ user: null, isAuthenticated: false });
      }
    }
  });
}
