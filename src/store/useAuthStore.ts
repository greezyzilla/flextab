import { create } from "zustand";
import { loadTokens, saveTokens, clearTokens, apiFetch, getAuthUrl, apiRegister, apiLogin } from "~src/services/api";
import { clearState } from "~src/lib/yjsDoc";
import { resetYjsHydration } from "~src/store/useSavedSpacesStore";
import type { TokenData } from "~src/services/api";

export interface User {
  id: string;
  email: string;
  name: string;
  avatar: string;
  provider: string;
  has_password: boolean;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  initialize: () => Promise<void>;
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

  initialize: async () => {
    const tokens = await loadTokens();
    if (tokens) {
      set({ isAuthenticated: true });
      try {
        await get().fetchUser();
      } catch (_) {
        set({ isAuthenticated: false, user: null });
      }
    }
    set({ isLoading: false });
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
    set({ isAuthenticated: true });
    await get().fetchUser();
  },

  logout: async () => {
    await clearTokens();
    await clearState();
    resetYjsHydration();
    try { await chrome.storage.local.remove("spaces"); } catch (_) { /* ok */ }
    set({ user: null, isAuthenticated: false });
  },

  fetchUser: async () => {
    const user = await apiFetch<User>("/api/me");
    set({ user });
  },
}));

// Listen for token changes in chrome.storage (set by background script or callback tab)
if (chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.auth_tokens) {
      const { isAuthenticated } = useAuthStore.getState();
      if (changes.auth_tokens.newValue && !isAuthenticated) {
        useAuthStore.getState().handleAuthCallback(changes.auth_tokens.newValue);
      } else if (!changes.auth_tokens.newValue && isAuthenticated) {
        useAuthStore.setState({ user: null, isAuthenticated: false });
      }
    }
  });
}
