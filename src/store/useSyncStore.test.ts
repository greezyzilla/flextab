import { describe, it, expect, beforeEach } from 'vitest';
import { useSyncStore } from './useSyncStore';

describe('useSyncStore', () => {
  beforeEach(() => {
    useSyncStore.getState().reset();
  });

  it('defaults to paused with no last-synced time', () => {
    const { status, lastSyncedAt } = useSyncStore.getState();
    expect(status).toBe('paused');
    expect(lastSyncedAt).toBeNull();
  });

  it('setStatus updates the status', () => {
    useSyncStore.getState().setStatus('online');
    expect(useSyncStore.getState().status).toBe('online');
  });

  it('markSynced records a timestamp', () => {
    const before = Date.now();
    useSyncStore.getState().markSynced();
    expect(useSyncStore.getState().lastSyncedAt).toBeGreaterThanOrEqual(before);
  });

  it('reset clears status and timestamp', () => {
    useSyncStore.getState().setStatus('online');
    useSyncStore.getState().markSynced();
    useSyncStore.getState().reset();
    expect(useSyncStore.getState().status).toBe('paused');
    expect(useSyncStore.getState().lastSyncedAt).toBeNull();
  });
});
