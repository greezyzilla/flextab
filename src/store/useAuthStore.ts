import { toast } from "sonner";
import { cancelPendingOAuth, OAUTH_START } from "~src/services/oauthLogin";
import { withSyncWriteLock } from "~src/services/syncPolicy";
import { create } from "zustand";
import { loadTokens, saveTokens, clearTokens, apiFetch, apiRegister, apiLogin, apiLogout, ApiError } from "~src/services/api";
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
const GUEST_MODE_KEY = "flextab_guest_mode";

async function loadGuestMode(): Promise<boolean> {
  try {
    const res = await chrome.storage.local.get(GUEST_MODE_KEY);
    return res[GUEST_MODE_KEY] === true;
  } catch (_) {
    return false;
  }
}

async function persistGuestMode(value: boolean): Promise<void> {
  try {
    if (value) await chrome.storage.local.set({ [GUEST_MODE_KEY]: true });
    else await chrome.storage.local.remove(GUEST_MODE_KEY);
  } catch (_) {
    /* ok */
  }
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  guestMode: boolean;

  initialize: () => Promise<void>;
  continueAsGuest: () => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  loginWithGithub: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  handleAuthCallback: (tokens: TokenData, alreadyStored?: boolean) => Promise<void>;
  logout: (confirmation: { discardLocalData: true }) => Promise<void>;
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
  guestMode: false,

  initialize: async () => {
    const tokens = await loadTokens();
    if (tokens) {
      // A real session always supersedes any stale guest flag.
      set({ isAuthenticated: true, guestMode: false });
      void persistGuestMode(false);
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
    } else {
      set({ guestMode: await loadGuestMode() });
    }
    set({ isLoading: false });
  },

  continueAsGuest: async () => {
    await persistGuestMode(true);
    set({ guestMode: true });
  },

  loginWithGoogle: () => requestOAuthLogin("google"),

  loginWithGithub: () => requestOAuthLogin("github"),

  loginWithEmail: async (email: string, password: string) => {
    const tokens = await apiLogin(email, password);
    await get().handleAuthCallback(tokens);
  },

  register: async (email: string, password: string, name: string) => {
    const tokens = await apiRegister(email, password, name);
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
      await persistGuestMode(false);
      // Preserve guest work for the existing explicit sync reconciliation flow.
      await clearStoredRevision();
      try { await chrome.storage.local.set({ [FRESH_LOGIN_KEY]: true }); } catch (_) { /* ok */ }
      try { await chrome.storage.local.remove(SYNC_HYDRATED_KEY); } catch (_) { /* ok */ }
      set({ isAuthenticated: true, guestMode: false });
      return true;
    });
    if (accepted) await get().fetchUser();
  },

  logout: async (confirmation) => {
    // Fail closed for stale callers (including an onClick MouseEvent): deleting
    // local data requires the explicit choice from the shared sign-out dialog.
    if (confirmation?.discardLocalData !== true) throw new Error("Confirm local data deletion before signing out");
    await withSyncWriteLock(async () => {
      await cancelPendingOAuth();
      // Drain an in-flight sync before clearing its revision/receipt and workspace.
      // Revoke the refresh token server-side before dropping it locally.
      await apiLogout();
      await clearTokens();
      await clearState();
      resetYjsHydration();
      await persistGuestMode(false);
      await clearStoredRevision();
      // The merge base is per-account, so it belongs here (real, explicit
      // sign-out) — not in stopSyncEngine's generic pause path, which also runs
      // on a transient auth drop (e.g. the refresh-token race) where the base
      // must survive so re-login doesn't manufacture a false merge conflict.
      await clearMergeBase();
      await clearConflictPending(); // per-account, like the merge base
      try { await chrome.storage.local.remove(["spaces", SYNC_HYDRATED_KEY, FRESH_LOGIN_KEY, LANDED_SNAPSHOT_KEY]); } catch (_) { /* ok */ }
      set({ user: null, isAuthenticated: false, guestMode: false });
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
    if (changes[GUEST_MODE_KEY]) {
      useAuthStore.setState({ guestMode: changes[GUEST_MODE_KEY].newValue === true });
    }
  });
}
