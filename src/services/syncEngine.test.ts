import { describe, it, expect, vi, beforeEach } from 'vitest';
import { v7 as uuidv7 } from 'uuid';
import { startLocalPersistence, stopLocalPersistence } from './syncEngine';
import { addSpace } from '~src/lib/yjsDoc';

// Regression guard: local persistence must be independent of auth / the realtime
// engine, so guests and auto-sync-off users still have changes saved.
describe('local persistence (decoupled from sync engine)', () => {
  beforeEach(() => {
    stopLocalPersistence();
    vi.clearAllMocks();
  });

  it('writes Yjs mutations to chrome.storage when started — no sign-in required', () => {
    startLocalPersistence();
    addSpace({ id: uuidv7(), name: 'Guest space', projects: [] });

    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({ flextab_yjs_state: expect.any(Array) }),
    );
    stopLocalPersistence();
  });

  it('stops writing the Yjs state after stopLocalPersistence', () => {
    startLocalPersistence();
    stopLocalPersistence();
    (chrome.storage.local.set as any).mockClear();

    addSpace({ id: uuidv7(), name: 'After stop', projects: [] });

    // Other writes (zustand UI-state) may still happen via observeDeep; only the
    // Yjs document persistence must stop.
    expect(chrome.storage.local.set).not.toHaveBeenCalledWith(
      expect.objectContaining({ flextab_yjs_state: expect.anything() }),
    );
  });
});
