import { create } from "zustand";
import { loadTokens, saveTokens, clearTokens, apiFetch, getAuthUrl } from "~src/services/api";
import type { TokenData } from "~src/services/api";

interface User {
  id: string;
  email: string;
  name: string;
  avatar: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  initialize: () => Promise<void>;
  login: () => void;
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
      } catch {
        // Token expired and refresh failed
        set({ isAuthenticated: false, user: null });
      }
    }
    set({ isLoading: false });
  },

  login: () => {
    // Open BE's Google OAuth in a new tab
    // The BE will redirect to the callback page after auth
    chrome.tabs.create({ url: getAuthUrl() });
  },

  handleAuthCallback: async (tokens: TokenData) => {
    await saveTokens(tokens);
    set({ isAuthenticated: true });
    await get().fetchUser();
  },

  logout: async () => {
    await clearTokens();
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
