import { create } from "zustand";
import { loadTokens, saveTokens, clearTokens, apiFetch, getAuthUrl, apiRegister, apiLogin } from "~src/services/api";
import { clearState } from "~src/lib/yjsDoc";
import { resetYjsHydration } from "~src/store/useSavedSpacesStore";
import { clearStoredRevision } from "~src/services/revision";
import type { TokenData } from "~src/services/api";

const SYNC_HYDRATED_KEY = "flextab_sync_hydrated";

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
      } catch (_) {
        set({ isAuthenticated: false, user: null });
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
    // Sign-in: the server account is authoritative. Reset the local doc so the
    // server's data hydrates cleanly rather than merging with guest/default data
    // (which produced duplicate "Personal" spaces) — and so stale local can't be
    // uploaded over the account's real data.
    await clearState();
    resetYjsHydration();
    await clearStoredRevision();
    try { await chrome.storage.local.remove(SYNC_HYDRATED_KEY); } catch (_) { /* ok */ }
    set({ isAuthenticated: true, guestMode: false });
    await get().fetchUser();
  },

  logout: async () => {
    await clearTokens();
    await clearState();
    resetYjsHydration();
    await persistGuestMode(false);
    await clearStoredRevision();
    try { await chrome.storage.local.remove(["spaces", SYNC_HYDRATED_KEY]); } catch (_) { /* ok */ }
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
