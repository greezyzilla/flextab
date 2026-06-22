import { create } from "zustand"

/**
 * Ephemeral UI state for the responsive shell. Intentionally NOT persisted —
 * drawer open/close should reset on reload and is purely presentational.
 */
interface UIState {
  leftDrawerOpen: boolean
  rightDrawerOpen: boolean
  setLeftDrawerOpen: (open: boolean) => void
  setRightDrawerOpen: (open: boolean) => void
  toggleLeftDrawer: () => void
  toggleRightDrawer: () => void
  closeDrawers: () => void
}

export const useUIStore = create<UIState>((set) => ({
  leftDrawerOpen: false,
  rightDrawerOpen: false,
  setLeftDrawerOpen: (leftDrawerOpen) => set({ leftDrawerOpen }),
  setRightDrawerOpen: (rightDrawerOpen) => set({ rightDrawerOpen }),
  toggleLeftDrawer: () => set((s) => ({ leftDrawerOpen: !s.leftDrawerOpen })),
  toggleRightDrawer: () => set((s) => ({ rightDrawerOpen: !s.rightDrawerOpen })),
  closeDrawers: () => set({ leftDrawerOpen: false, rightDrawerOpen: false }),
}))
