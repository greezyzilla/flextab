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

  it('tracks one inline create request at a time and opens the navigation drawer', () => {
    const then = () => {};
    useUIStore.getState().startCreate({ kind: 'category', spaceId: 's', projectId: 'p', then });
    expect(useUIStore.getState().creating).toEqual({ kind: 'category', spaceId: 's', projectId: 'p', then });
    expect(useUIStore.getState().leftDrawerOpen).toBe(true);
    useUIStore.getState().endCreate();
    expect(useUIStore.getState().creating).toBeNull();
  });

  it('re-requests a scroll to the same category with a new nonce', () => {
    useUIStore.getState().requestScrollToCategory('c1');
    const first = useUIStore.getState().scrollTarget!;
    useUIStore.getState().requestScrollToCategory('c1');
    expect(useUIStore.getState().scrollTarget).toEqual({ categoryId: 'c1', nonce: first.nonce + 1, mode: 'top' });
    useUIStore.getState().requestScrollToCategory('c2', 'ifNeeded');
    expect(useUIStore.getState().scrollTarget).toMatchObject({ categoryId: 'c2', mode: 'ifNeeded' });
  });
});
