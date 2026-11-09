import { create } from "zustand"

// Drives the over-cap notice (TASK-33): a first sign-in would upload more tabs
// than the account's plan syncs, so the person is told before the upload.
interface OverCapNoticeState {
  pending: boolean
  tabs: number
  cap: number
  open: (tabs: number, cap: number) => void
  close: () => void
}

export const useOverCapNotice = create<OverCapNoticeState>((set) => ({
  pending: false,
  tabs: 0,
  cap: 0,
  open: (tabs, cap) => set({ pending: true, tabs, cap }),
  close: () => set({ pending: false, tabs: 0, cap: 0 }),
}))
