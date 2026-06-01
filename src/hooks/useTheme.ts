import { useEffect } from 'react';
import { useSettingsStore, ACCENT_COLORS } from '~src/store/useSettingsStore';

// Original lightness values for black-* scale (from hex)
const BG_SCALE: { key: string; l: number }[] = [
  { key: '--color-black-950', l: 4 },
  { key: '--color-black-900', l: 9 },
  { key: '--color-black-800', l: 15 },
  { key: '--color-black-700', l: 25 },
  { key: '--color-black-600', l: 32 },
  { key: '--color-black-500', l: 45 },
];

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s * 100, l * 100];
}

function darkenHex(hex: string, amount: number): string {
  const [h, s, l] = hexToHsl(hex);
  return `hsl(${h}, ${s}%, ${Math.max(0, l - amount)}%)`;
}

function withAlpha(hex: string, alpha: string): string {
  return hex + alpha;
}

export function useTheme() {
  const accentColor = useSettingsStore(s => s.accentColor);
  const customAccent = useSettingsStore(s => s.customAccent);
  const density = useSettingsStore(s => s.density);
  const bgTint = useSettingsStore(s => s.bgTint);

  // Accent color + background tint (derived from accent hue)
  useEffect(() => {
    const root = document.documentElement;
    const accentHex = customAccent || ACCENT_COLORS[accentColor].value;

    if (customAccent) {
      root.style.setProperty('--accent', customAccent);
      root.style.setProperty('--accent-hover', darkenHex(customAccent, 8));
      root.style.setProperty('--accent-subtle', withAlpha(customAccent, '20'));
    } else {
      const accent = ACCENT_COLORS[accentColor];
      root.style.setProperty('--accent', accent.value);
      root.style.setProperty('--accent-hover', accent.hover);
      root.style.setProperty('--accent-subtle', accent.subtle);
    }

    // Background tint — hue follows accent color
    if (bgTint === 0) {
      for (const { key } of BG_SCALE) {
        root.style.removeProperty(key);
      }
    } else {
      const [hue] = hexToHsl(accentHex);
      for (const { key, l } of BG_SCALE) {
        root.style.setProperty(key, `hsl(${hue}, ${bgTint}%, ${l}%)`);
      }
    }
  }, [accentColor, customAccent, bgTint]);

  // Density
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
