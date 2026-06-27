import { useEffect } from 'react';
import { useSettingsStore } from '~src/store/useSettingsStore';

/**
 * Theme = a single hue + tint intensity. Everything (accent, surfaces) is derived
 * from --hue / --tint in style.css via HSL, so this hook only writes those two
 * numbers. See style.css :root.
 */
export function useTheme() {
  const hue = useSettingsStore(s => s.hue);
  const bgTint = useSettingsStore(s => s.bgTint);
  const density = useSettingsStore(s => s.density);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--hue', String(hue));
    root.style.setProperty('--tint', String(bgTint));
  }, [hue, bgTint]);

  useEffect(() => {
    const root = document.documentElement;
    if (density === 'compact') {
      root.classList.add('density-compact');
      root.classList.remove('density-comfortable');
    } else {
      root.classList.add('density-comfortable');
      root.classList.remove('density-compact');
    }
  }, [density]);
}
