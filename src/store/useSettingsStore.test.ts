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

  it("adopts an accent picked on another page, so open pages repaint and never write the old one back", async () => {
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

describe('settings saved by older versions migrate', () => {
  const migrate = (persisted: unknown, version: number) =>
    useSettingsStore.persist.getOptions().migrate!(structuredClone(persisted), version) as unknown as Record<string, unknown>;

  it.each([
    ['#00ff00', 120], ['#0000ff', 240], ['#ff0000', 0], ['#ff00ff', 300], ['ff8000', 30],
    ['#808080', 214], ['not a colour', 214],
  ])('turns a v0 custom accent %s into hue %i', (customAccent, hue) => {
    const s = migrate({ customAccent, accentColor: 'blue' }, 0);
    expect(s.hue).toBe(hue);
    expect(s).not.toHaveProperty('customAccent');
    expect(s).not.toHaveProperty('accentColor');
  });

  it.each([['purple', 262], ['cyan', 190], ['mauve', 214]])('turns a v0 preset %s into hue %i', (accentColor, hue) => {
    expect(migrate({ accentColor }, 0).hue).toBe(hue);
  });

  it('keeps a v0 record without any accent as it is', () => {
    expect(migrate({ density: 'compact' }, 0)).toEqual({ density: 'compact', intensity: 100 });
  });

  it('turns a v1 surface tint into full colour intensity, keeping a chosen intensity', () => {
    expect(migrate({ bgTint: 8 }, 1)).toEqual({ intensity: 100 });
    expect(migrate({ bgTint: 8, intensity: 40 }, 1)).toEqual({ intensity: 40 });
  });

  it('leaves a current or empty record alone', () => {
    expect(migrate({ hue: 10, bgTint: 3 }, 2)).toEqual({ hue: 10, bgTint: 3 });
    expect(migrate(null, 0)).toBeNull();
  });
});

describe('settings changes from other pages that are not for this store', () => {
  const fire = (changes: Record<string, unknown>, area: string) => {
    for (const [listener] of vi.mocked(chrome.storage.onChanged.addListener).mock.calls) listener(changes as never, area as never);
  };

  it.each([
    ['another storage area', { 'flextab-settings': { newValue: '{"state":{"hue":1}}' } }, 'sync'],
    ['a removed record', { 'flextab-settings': { oldValue: '{}' } }, 'local'],
    ['a record without state', { 'flextab-settings': { newValue: '{"version":2}' } }, 'local'],
    ['a malformed record', { 'flextab-settings': { newValue: '{not json' } }, 'local'],
  ])('ignores %s', (_, changes, area) => {
    const rehydrate = vi.spyOn(useSettingsStore.persist, 'rehydrate');
    try {
      expect(() => fire(changes, area)).not.toThrow();
      expect(rehydrate).not.toHaveBeenCalled();
    } finally { rehydrate.mockRestore(); }
  });
});
