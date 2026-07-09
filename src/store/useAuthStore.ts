import { create } from "zustand";
import { loadTokens, saveTokens, clearTokens, apiFetch, getAuthUrl, getOAuthUrl, apiRegister, apiLogin, apiLogout, ApiError } from "~src/services/api";
import { clearState } from "~src/lib/yjsDoc";
import { resetYjsHydration } from "~src/store/useSavedSpacesStore";
import { clearStoredRevision } from "~src/services/revision";
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
  loginWithGoogle: () => void;
  loginWithGithub: () => void;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  handleAuthCallback: (tokens: TokenData) => Promise<void>;
  logout: () => Promise<void>;
  fetchUser: () => Promise<void>;
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

  loginWithGoogle: () => {
    chrome.tabs.create({ url: getAuthUrl() });
  },

  loginWithGithub: () => {
    chrome.tabs.create({ url: getOAuthUrl("github") });
  },

  loginWithEmail: async (email: string, password: string) => {
    const tokens = await apiLogin(email, password);
    await get().handleAuthCallback(tokens);
  },

  register: async (email: string, password: string, name: string) => {
    const tokens = await apiRegister(email, password, name);
    await get().handleAuthCallback(tokens);
  },

  handleAuthCallback: async (tokens: TokenData) => {
    await saveTokens(tokens);
    await persistGuestMode(false);
    // Keep local data (it may be guest work to reconcile). Mark this as an
    // explicit login so the sync engine pulls the account and, if BOTH local and
    // the account have real tabs, asks the user how to resolve instead of
    // overwriting. Clear per-account sync state so it re-seeds for this account.
    await clearStoredRevision();
    try { await chrome.storage.local.set({ [FRESH_LOGIN_KEY]: true }); } catch (_) { /* ok */ }
    try { await chrome.storage.local.remove(SYNC_HYDRATED_KEY); } catch (_) { /* ok */ }
    set({ isAuthenticated: true, guestMode: false });
    await get().fetchUser();
  },

  logout: async () => {
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
    try { await chrome.storage.local.remove(["spaces", SYNC_HYDRATED_KEY, FRESH_LOGIN_KEY]); } catch (_) { /* ok */ }
    set({ user: null, isAuthenticated: false, guestMode: false });
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
        useAuthStore.getState().handleAuthCallback(changes.auth_tokens.newValue);
      } else if (!changes.auth_tokens.newValue && isAuthenticated) {
        useAuthStore.setState({ user: null, isAuthenticated: false });
      }
    }
    if (changes[GUEST_MODE_KEY]) {
      useAuthStore.setState({ guestMode: changes[GUEST_MODE_KEY].newValue === true });
    }
  });
}
