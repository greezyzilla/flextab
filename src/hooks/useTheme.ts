import { useEffect } from 'react';
import { useSettingsStore, type FontKey } from '~src/store/useSettingsStore';
import { applyThemeMode, storeThemeMode } from '~src/lib/theme';

/**
 * Theme = a single hue + tint intensity. Everything (accent, surfaces) is derived
 * from --hue / --intensity in style.css via HSL, so this hook only writes those two
 * numbers. See style.css :root.
 */
const DENSITY_CLASSES = ['density-compact', 'density-cozy', 'density-comfortable'];

const FONT_STACKS: Record<FontKey, string> = {
  inter: '"Inter Variable", Inter, system-ui, -apple-system, sans-serif',
  system: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  rounded: 'ui-rounded, "SF Pro Rounded", "Nunito", "Quicksand", system-ui, sans-serif',
  serif: 'Georgia, Cambria, "Times New Roman", ui-serif, serif',
  mono: 'ui-monospace, "SF Mono", "Cascadia Code", Menlo, monospace',
};

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
    const root = document.documentElement;
    root.style.setProperty('--hue', String(hue));
    root.style.setProperty('--intensity', String(intensity));
    root.style.setProperty('--group-tint', String(groupTint));
    root.style.setProperty('--radius', `${radius}px`);
    root.style.setProperty('--font-sans', FONT_STACKS[fontFamily] ?? FONT_STACKS.inter);
    // UI scale = scale the rem base, so all rem-based sizing (Tailwind spacing,
    // text, widths) scales proportionally like a multiplier — the layout reflows
    // and viewport (vw/vh) containers still fill the window. NOT `zoom`, which is
    // a viewport zoom that left white gaps below 100% and just zoomed in above.
    root.style.fontSize = `${uiScale * 100}%`;
    root.style.removeProperty('zoom'); // clear any value from the old approach
  }, [hue, intensity, groupTint, radius, fontFamily, uiScale]);

  useEffect(() => {
    applyThemeMode(theme);
    storeThemeMode(theme);
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove(...DENSITY_CLASSES);
    root.classList.add(`density-${density}`);
  }, [density]);

  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', reduceMotion);
  }, [reduceMotion]);
}
