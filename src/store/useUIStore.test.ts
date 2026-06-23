import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from './useUIStore';

beforeEach(() => useUIStore.setState({ leftDrawerOpen: false, rightDrawerOpen: false }));

describe('useUIStore', () => {
  it('sets left/right drawer open state', () => {
    useUIStore.getState().setLeftDrawerOpen(true);
    useUIStore.getState().setRightDrawerOpen(true);
    expect(useUIStore.getState().leftDrawerOpen).toBe(true);
    expect(useUIStore.getState().rightDrawerOpen).toBe(true);
  });

  it('toggles each drawer', () => {
    useUIStore.getState().toggleLeftDrawer();
    expect(useUIStore.getState().leftDrawerOpen).toBe(true);
    useUIStore.getState().toggleLeftDrawer();
    expect(useUIStore.getState().leftDrawerOpen).toBe(false);
    useUIStore.getState().toggleRightDrawer();
    expect(useUIStore.getState().rightDrawerOpen).toBe(true);
  });

  it('closeDrawers closes both', () => {
    useUIStore.setState({ leftDrawerOpen: true, rightDrawerOpen: true });
    useUIStore.getState().closeDrawers();
    expect(useUIStore.getState().leftDrawerOpen).toBe(false);
    expect(useUIStore.getState().rightDrawerOpen).toBe(false);
  });
});
