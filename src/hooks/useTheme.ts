import { useEffect } from 'react';
import { useSettingsStore } from '~src/store/useSettingsStore';

/**
 * Theme = a single hue + tint intensity. Everything (accent, surfaces) is derived
 * from --hue / --intensity in style.css via HSL, so this hook only writes those two
 * numbers. See style.css :root.
 */
export function useTheme() {
  const hue = useSettingsStore(s => s.hue);
  const intensity = useSettingsStore(s => s.intensity);
  const density = useSettingsStore(s => s.density);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--hue', String(hue));
    root.style.setProperty('--intensity', String(intensity));
  }, [hue, intensity]);

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
