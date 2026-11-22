import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSettingsStore, HUE_PRESETS } from './useSettingsStore';

beforeEach(() => useSettingsStore.setState({
  groupLayout: 'list', gridColumns: 2, density: 'comfortable',
  hue: 214, intensity: 100, autoSync: true,
}));

describe('useSettingsStore', () => {
  it('exposes hue presets', () => {
    expect(HUE_PRESETS.length).toBeGreaterThan(0);
    expect(HUE_PRESETS.every(p => p.hue >= 0 && p.hue <= 360)).toBe(true);
  });

  it('updates each setting', () => {
    const s = useSettingsStore.getState();
    s.setGroupLayout('grid');
    s.setGridColumns(4);
    s.setDensity('compact');
    s.setHue(262);
    s.setIntensity(50);
    s.setAutoSync(false);
    const st = useSettingsStore.getState();
    expect(st.groupLayout).toBe('grid');
    expect(st.gridColumns).toBe(4);
    expect(st.density).toBe('compact');
    expect(st.hue).toBe(262);
    expect(st.intensity).toBe(50);
    expect(st.autoSync).toBe(false);
  });

  it("adopts another page's Off preference without writing a stale settings snapshot back", async () => {
    const read = vi.mocked(chrome.storage.local.get).getMockImplementation()!;
    const value = JSON.stringify({ state: { autoSync: false, hue: 262 }, version: 2 });
    vi.mocked(chrome.storage.local.get).mockImplementation(async () => ({ 'flextab-settings': value }));
    vi.mocked(chrome.storage.local.set).mockClear();
    try {
      for (const [listener] of vi.mocked(chrome.storage.onChanged.addListener).mock.calls) {
        listener({ 'flextab-settings': { newValue: value } }, 'local');
      }
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(useSettingsStore.getState().autoSync).toBe(false);
      expect(useSettingsStore.getState().hue).toBe(262);
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
    } finally { vi.mocked(chrome.storage.local.get).mockImplementation(read); }
  });

  it("adopts an accent picked on another page, so open pages repaint and never write the old one back (TASK-107)", async () => {
    const read = vi.mocked(chrome.storage.local.get).getMockImplementation()!;
    const value = JSON.stringify({ state: { ...useSettingsStore.getState(), hue: 145, appIcon: 'blue', lastModified: 1 }, version: 2 });
    vi.mocked(chrome.storage.local.get).mockImplementation(async () => ({ 'flextab-settings': value }));
    vi.mocked(chrome.storage.local.set).mockClear();
    try {
      for (const [listener] of vi.mocked(chrome.storage.onChanged.addListener).mock.calls) {
        listener({ 'flextab-settings': { newValue: value } }, 'local');
      }
      await vi.waitFor(() => expect(useSettingsStore.getState().hue).toBe(145));
      expect(useSettingsStore.getState().appIcon).toBe('blue');
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
    } finally { vi.mocked(chrome.storage.local.get).mockImplementation(read); }
  });

  it('persists changes through the storage adapter', async () => {
    (chrome.storage.local.set as any).mockClear();
    useSettingsStore.getState().setGroupLayout('grid');
    await useSettingsStore.persist.rehydrate(); // exercises getItem
    await new Promise(r => setTimeout(r, 0));    // let the debounced setItem flush
    expect(chrome.storage.local.set).toHaveBeenCalled();
  });
});
