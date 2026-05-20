import { rgbToLab, type LabColor } from './color-convert';
import type { PatternPaletteColor } from './color-system';

export type PatternPaletteColorLab = PatternPaletteColor & {
  lab: LabColor;
};

const paletteLabCache = new Map<string, PatternPaletteColorLab[]>();

function getCacheKey(palette: PatternPaletteColor[]) {
  return palette.map((color) => `${color.colorId}:${color.hex}`).join('|');
}

export function getPaletteLabCache(palette: PatternPaletteColor[]) {
  const cacheKey = getCacheKey(palette);
  const cached = paletteLabCache.get(cacheKey);
  if (cached) {
    return {
      colors: cached,
      cacheHit: true,
    };
  }

  const colors = palette.map((color) => ({
    ...color,
    lab: rgbToLab(color.rgb),
  }));

  paletteLabCache.set(cacheKey, colors);
  return {
    colors,
    cacheHit: false,
  };
}
