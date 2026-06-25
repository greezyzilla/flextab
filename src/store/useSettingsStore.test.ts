import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore, ACCENT_COLORS } from './useSettingsStore';

beforeEach(() => useSettingsStore.setState({
  groupLayout: 'list', gridColumns: 2, density: 'comfortable',
  accentColor: 'blue', customAccent: null, bgTint: 0, autoSync: true,
}));

describe('useSettingsStore', () => {
  it('exposes the accent palette', () => {
    expect(Object.keys(ACCENT_COLORS)).toContain('blue');
    expect(ACCENT_COLORS.blue.value).toBe('#2274F0'); // brand blue (matches logo + landing)
  });

  it('updates each setting', () => {
    const s = useSettingsStore.getState();
    s.setGroupLayout('grid');
    s.setGridColumns(4);
    s.setDensity('compact');
    s.setBgTint(8);
    s.setAutoSync(false);
    const st = useSettingsStore.getState();
    expect(st.groupLayout).toBe('grid');
    expect(st.gridColumns).toBe(4);
    expect(st.density).toBe('compact');
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

  it('setAccentColor clears a custom accent', () => {
    useSettingsStore.getState().setCustomAccent('#123456');
    expect(useSettingsStore.getState().customAccent).toBe('#123456');
    useSettingsStore.getState().setAccentColor('purple');
    expect(useSettingsStore.getState().accentColor).toBe('purple');
    expect(useSettingsStore.getState().customAccent).toBeNull();
  });
});
