import { create } from "zustand"
import { LEFT_INLINE_QUERY } from "~src/hooks/useMediaQuery"

/**
 * An inline "name the new node" row the sidebar should show. `then` resumes
 * the action that needed the node (e.g. a drop onto an empty space) once a
 * category exists; a project request carries it into its category step.
 */
export type CreateRequest =
  | { kind: "project"; spaceId: string; then?: () => void }
  | { kind: "category"; spaceId: string; projectId: string; then?: () => void }

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

  /**
   * Structure is created by naming it first: the sidebar renders an inline
   * input for this request and only writes a node once the user commits a
   * name (no placeholder "New Project" / "Default Category" nodes).
   */
  creating: CreateRequest | null
  startCreate: (request: CreateRequest) => void
  endCreate: () => void

  /**
   * A category section the project page should scroll to. The nonce makes
   * repeated clicks on the same category scroll again. "top" = navigation
   * (bring the section to the top); "ifNeeded" = only scroll when the section
   * header is off-screen (e.g. right after creating it), so the page doesn't
   * jump away from what the user was looking at.
   */
  scrollTarget: { categoryId: string; nonce: number; mode: ScrollMode } | null
  requestScrollToCategory: (categoryId: string, mode?: ScrollMode) => void

  /**
   * The category whose section shows the inline "name the new group" row.
   * A group is named first and then created at the top, below Unsorted.
   */
  namingGroupIn: string | null
  startNamingGroup: (categoryId: string) => void
  endNamingGroup: () => void

  /** The "Save all tabs" dialog (button + keyboard shortcut). */
  saveAllOpen: boolean
  setSaveAllOpen: (open: boolean) => void
  /** The keyboard shortcut sheet (TASK-13), opened with "?" or its footer button. */
  shortcutsOpen: boolean
  setShortcutsOpen: (open: boolean) => void
  /**
   * A tab or group to point at briefly after search revealed it (TASK-14):
   * it scrolls into view and is outlined for a moment. The nonce lets the
   * same item be revealed twice in a row.
   */
  flashTarget: { kind: "tab" | "group"; id: string; nonce: number } | null
  flash: (kind: "tab" | "group", id: string) => void
}

export type ScrollMode = "top" | "ifNeeded"

function leftPanelIsDrawer(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true
  return !window.matchMedia(LEFT_INLINE_QUERY).matches
}

export const useUIStore = create<UIState>((set) => ({
  leftDrawerOpen: false,
  rightDrawerOpen: false,
  setLeftDrawerOpen: (leftDrawerOpen) => set({ leftDrawerOpen }),
  setRightDrawerOpen: (rightDrawerOpen) => set({ rightDrawerOpen }),
  toggleLeftDrawer: () => set((s) => ({ leftDrawerOpen: !s.leftDrawerOpen })),
  toggleRightDrawer: () => set((s) => ({ rightDrawerOpen: !s.rightDrawerOpen })),
  closeDrawers: () => set({ leftDrawerOpen: false, rightDrawerOpen: false }),

  creating: null,
  // Creating happens in the sidebar, so open its drawer, but only while the
  // sidebar IS a drawer (TASK-21): set at a wide width, the flag would linger
  // and pop the drawer open the moment the window is narrowed.
  startCreate: (creating) => set({ creating, ...(leftPanelIsDrawer() ? { leftDrawerOpen: true } : {}) }),
  endCreate: () => set({ creating: null }),

  scrollTarget: null,
  requestScrollToCategory: (categoryId, mode = "top") =>
    set((s) => ({ scrollTarget: { categoryId, nonce: (s.scrollTarget?.nonce ?? 0) + 1, mode } })),

  namingGroupIn: null,
  startNamingGroup: (namingGroupIn) => set({ namingGroupIn }),
  endNamingGroup: () => set({ namingGroupIn: null }),

  saveAllOpen: false,
  setSaveAllOpen: (saveAllOpen) => set({ saveAllOpen }),
  shortcutsOpen: false,
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  flashTarget: null,
  flash: (kind, id) => set((s) => ({ flashTarget: { kind, id, nonce: (s.flashTarget?.nonce ?? 0) + 1 } })),
}))
