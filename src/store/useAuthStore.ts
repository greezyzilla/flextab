import { clearKeptOnSignOut, markKeptOnSignOut } from "~src/services/keptWorkspace";
import { toast } from "sonner";
import { cancelPendingOAuth, OAUTH_START } from "~src/services/oauthLogin";
import { withSyncWriteLock } from "~src/services/syncPolicy";
import { create } from "zustand";
import { loadTokens, saveTokens, clearTokens, apiFetch, apiLogin, apiLogout, ApiError } from "~src/services/api";
import { clearState } from "~src/lib/yjsDoc";
import { resetYjsHydration } from "~src/store/useSavedSpacesStore";
import { clearStoredRevision } from "~src/services/revision";
import { LANDED_SNAPSHOT_KEY } from "~src/services/landedSnapshot";
import { clearMergeBase } from "~src/services/mergeBase";
import { clearConflictPending } from "~src/services/conflictState";
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
}

// Guest mode lets users try the app fully (local-only) before signing in.
// Persisted to chrome.storage.local so it survives reloads and syncs across tabs
// via the onChanged listener below. Auth always wins: signing in clears it.
// Guest mode is gone (TASK-7): the workspace is always local, an account only
// adds sync. The old flag is removed once so it does not linger in storage.
const LEGACY_GUEST_MODE_KEY = "flextab_guest_mode";

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  initialize: () => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  loginWithGithub: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  handleAuthCallback: (tokens: TokenData, alreadyStored?: boolean) => Promise<void>;
  /**
   * Sign out. "keep" leaves this device's workspace in place as a local-only
   * workspace (TASK-7): the next sign-in, to any account, reconciles it through
   * the same guest→account path as a first login. "remove" also deletes it.
   */
  logout: (choice: { localData: "keep" | "remove" }) => Promise<void>;
  fetchUser: () => Promise<void>;
}

async function requestOAuthLogin(provider: "google" | "github"): Promise<void> {
  try {
    const result = await chrome.runtime.sendMessage({ type: OAUTH_START, provider });
    if (!result?.ok) throw new Error("Sign-in could not start. Please try again.");
  } catch (_) { toast.error("Sign-in could not start. Please try again."); }
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  initialize: async () => {
    const tokens = await loadTokens();
    if (tokens) {
      set({ isAuthenticated: true });
      try {
        await get().fetchUser();
      } catch (err) {
        // Local-first: only sign out on a real auth rejection (401 — the BE
        // explicitly rejected the token, which clears it). A network error /
        // BE being down keeps the cached session so the app still works offline.
        if (err instanceof ApiError && err.status === 401) {
          set({ isAuthenticated: false, user: null });
        }
      }
    }
    try { void chrome.storage.local.remove(LEGACY_GUEST_MODE_KEY); } catch (_) { /* ok */ }
    set({ isLoading: false });
  },

  loginWithGoogle: () => requestOAuthLogin("google"),

  loginWithGithub: () => requestOAuthLogin("github"),

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
      try { await chrome.storage.local.remove(SYNC_HYDRATED_KEY); } catch (_) { /* ok */ }
      // Invalidate the previous identity before releasing the login lock.
      // Account-bound work must wait for /me for the newly accepted tokens.
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
      await clearTokens();
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
      const keys = [SYNC_HYDRATED_KEY, FRESH_LOGIN_KEY, LANDED_SNAPSHOT_KEY];
      if (localData === "remove") keys.push("spaces");
      try { await chrome.storage.local.remove(keys); } catch (_) { /* ok */ }
      set({ user: null, isAuthenticated: false });
    });
  },

  fetchUser: async () => {
    const user = await apiFetch<User>("/api/me");
    set({ user });
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
        useAuthStore.setState({ user: null, isAuthenticated: false });
      }
    }
  });
}
