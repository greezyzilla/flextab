import { useEffect } from 'react';
import { useSettingsStore } from '~src/store/useSettingsStore';
import { applyAppearance, applyThemeMode, storeAppearance, storeThemeMode } from '~src/lib/theme';

/**
 * Theme = a single hue + tint intensity. Everything (accent, surfaces) is derived
 * from --hue / --intensity in style.css via HSL, so this hook only writes those
 * numbers (lib/theme.ts applyAppearance). Each change is mirrored to localStorage
 * so the next page paints it before its first render. See style.css :root.
 */
export function useTheme() {
  const theme = useSettingsStore(s => s.theme);
  const hue = useSettingsStore(s => s.hue);
  const intensity = useSettingsStore(s => s.intensity);
  const groupTint = useSettingsStore(s => s.groupTint);
  const density = useSettingsStore(s => s.density);
  const radius = useSettingsStore(s => s.radius);
  const reduceMotion = useSettingsStore(s => s.reduceMotion);
  const fontFamily = useSettingsStore(s => s.fontFamily);
  const uiScale = useSettingsStore(s => s.uiScale);

  useEffect(() => {
    const appearance = { hue, intensity, groupTint, radius, fontFamily, uiScale, density, reduceMotion };
    applyAppearance(appearance);
    storeAppearance(appearance);
  }, [hue, intensity, groupTint, radius, fontFamily, uiScale, density, reduceMotion]);

  useEffect(() => {
    applyThemeMode(theme);
    storeThemeMode(theme);
  }, [theme]);
}
