import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore, HUE_PRESETS } from './useSettingsStore';

beforeEach(() => useSettingsStore.setState({
  groupLayout: 'list', gridColumns: 2, density: 'comfortable',
  hue: 214, bgTint: 6, autoSync: true,
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
    s.setBgTint(8);
    s.setAutoSync(false);
    const st = useSettingsStore.getState();
    expect(st.groupLayout).toBe('grid');
    expect(st.gridColumns).toBe(4);
    expect(st.density).toBe('compact');
    expect(st.hue).toBe(262);
    expect(st.bgTint).toBe(8);
    expect(st.autoSync).toBe(false);
  });

  it('persists changes through the storage adapter', async () => {
    (chrome.storage.local.set as any).mockClear();
    useSettingsStore.getState().setGroupLayout('grid');
    await useSettingsStore.persist.rehydrate(); // exercises getItem
    await new Promise(r => setTimeout(r, 0));    // let the debounced setItem flush
    expect(chrome.storage.local.set).toHaveBeenCalled();
  });
});
