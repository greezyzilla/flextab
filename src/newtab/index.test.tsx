import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const settings = vi.hoisted(() => ({ pull: vi.fn(), start: vi.fn(), stop: vi.fn() }));
vi.mock('~src/services/settingsSync', () => ({
  pullSettings: settings.pull, startSettingsSync: settings.start, stopSettingsSync: settings.stop,
}));
vi.mock('~src/store/useAuthStore', async () => {
  const { create } = await import('zustand');
  return { useAuthStore: create(() => ({
    user: null, isAuthenticated: true, isLoading: false, guestMode: false, initialize: vi.fn(),
  })) };
});
vi.mock('~src/store/useSavedSpacesStore', () => ({
  useHydrated: () => ({ hydrated: true, error: false }),
  useSavedSpacesStore: (select: (s: { savedSpaces: [] }) => unknown) => select({ savedSpaces: [] }),
}));
vi.mock('~src/store/useSettingsStore', () => ({
  useSettingsStore: (select: (s: { autoSync: boolean }) => unknown) => select({ autoSync: false }),
}));
vi.mock('~src/services/syncEngine', () => ({
  startSyncEngine: vi.fn(), stopSyncEngine: vi.fn(), startLocalPersistence: vi.fn(), stopLocalPersistence: vi.fn(),
}));
vi.mock('~src/components/WorkspaceLoadError', () => ({ WorkspaceLoadError: () => null }));
vi.mock('~src/components/SyncConflictModal', () => ({ SyncConflictModal: () => null }));
vi.mock('~src/components/MergeConflictModal', () => ({ MergeConflictModal: () => null }));
vi.mock('~src/components/OnboardingScreen', () => ({ OnboardingScreen: () => null }));
vi.mock('~src/components/layout/AppShell', () => ({ AppShell: () => null }));

import NewTabPage from './index';
import { useAuthStore } from '~src/store/useAuthStore';

const user = (id: string) => ({ id, email: `${id}@example.invalid`, name: id, avatar: '', provider: 'email', has_password: true });
beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ isAuthenticated: true, user: null });
});

describe('new-tab account settings lifecycle', () => {
  it('waits for profile identity and restarts when the signed-in account changes', () => {
    const view = render(<NewTabPage />);
    expect(settings.pull).not.toHaveBeenCalled();
    expect(settings.start).not.toHaveBeenCalled();
    act(() => useAuthStore.setState({ user: user('A') }));
    expect(settings.pull).toHaveBeenCalledTimes(1);
    expect(settings.start).toHaveBeenCalledTimes(1);
    act(() => useAuthStore.setState({ user: user('B') }));
    expect(settings.stop).toHaveBeenCalledTimes(1);
    expect(settings.pull).toHaveBeenCalledTimes(2);
    expect(settings.start).toHaveBeenCalledTimes(2);
    view.unmount();
    expect(settings.stop).toHaveBeenCalledTimes(2);
  });

  it('keeps the same lifecycle on profile refresh and stops on sign-out', () => {
    useAuthStore.setState({ user: user('A') });
    render(<NewTabPage />);
    act(() => useAuthStore.setState({ user: { ...user('A'), name: 'Updated' } }));
    expect(settings.pull).toHaveBeenCalledTimes(1);
    expect(settings.stop).not.toHaveBeenCalled();
    act(() => useAuthStore.setState({ user: null, isAuthenticated: false }));
    expect(settings.stop).toHaveBeenCalledTimes(1);
    expect(settings.start).toHaveBeenCalledTimes(1);
  });
});
