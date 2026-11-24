import { useEffect, useState } from 'react';
import { useSettingsStore } from '~src/store/useSettingsStore';
import { applyAppearance, applyThemeMode, storeAppearance, storeThemeMode } from '~src/lib/theme';
import { APP_ICON_STORAGE_KEY, applyAppIconFavicon } from '~src/lib/appIcon';

/**
 * Theme = a single hue + tint intensity. Everything (accent, surfaces) is derived
 * from --hue / --intensity in style.css via HSL, so this hook only writes those
 * numbers (lib/theme.ts applyAppearance). Each change is mirrored to localStorage
 * so the next page paints it before its first render (the boot script), and the
 * app icon's look to chrome.storage for the toolbar button.
 */
export function useTheme() {
  // The store loads from chrome.storage after the first render; until then it holds the defaults.
  // Applying those would repaint a page the boot script already drew in the user's look (a flash of
  // FlexTab blue) and overwrite the copies with them, so nothing is applied before it has loaded.
  const [loaded, setLoaded] = useState(() => useSettingsStore.persist?.hasHydrated?.() ?? true);
  useEffect(() => {
    if (loaded) return;
    const unsubscribe = useSettingsStore.persist?.onFinishHydration?.(() => setLoaded(true));
    if (useSettingsStore.persist?.hasHydrated?.()) setLoaded(true);
    return unsubscribe;
  }, [loaded]);
  const theme = useSettingsStore(s => s.theme);
  const hue = useSettingsStore(s => s.hue);
  const intensity = useSettingsStore(s => s.intensity);
  const groupTint = useSettingsStore(s => s.groupTint);
  const density = useSettingsStore(s => s.density);
  const radius = useSettingsStore(s => s.radius);
  const reduceMotion = useSettingsStore(s => s.reduceMotion);
  const fontFamily = useSettingsStore(s => s.fontFamily);
  const uiScale = useSettingsStore(s => s.uiScale);
  const appIcon = useSettingsStore(s => s.appIcon);

  useEffect(() => {
    if (!loaded) return;
    const appearance = { hue, intensity, groupTint, radius, fontFamily, uiScale, density, reduceMotion, appIcon };
    applyAppearance(appearance);
    storeAppearance(appearance);
  }, [loaded, hue, intensity, groupTint, radius, fontFamily, uiScale, density, reduceMotion, appIcon]);

  useEffect(() => {
    if (!loaded) return;
    const look = { hue, intensity, appIcon };
    void applyAppIconFavicon(look).catch(() => { /* the page keeps its own icon */ });
    void chrome.storage?.local?.set({ [APP_ICON_STORAGE_KEY]: look })?.catch(() => { /* the toolbar keeps its icon */ });
  }, [loaded, hue, intensity, appIcon]);

  useEffect(() => {
    if (!loaded) return;
    applyThemeMode(theme);
    storeThemeMode(theme);
  }, [loaded, theme]);
}
