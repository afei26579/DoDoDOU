import mappingData from './colorSystemMapping.json';
import type { ColorSystem } from '../../features/workshop/model/types';

export type PatternRgb = {
  r: number;
  g: number;
  b: number;
};

export type PatternPaletteColor = {
  colorId: string;
  vendorCode: string;
  hex: string;
  rgb: PatternRgb;
};

type ColorMapping = Record<string, Record<ColorSystem, string>>;

const colorSystemMapping = mappingData as ColorMapping;

export function hexToRgb(hex: string): PatternRgb | null {
  const normalized = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;

  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

export function buildPalette(colorSystem: ColorSystem): PatternPaletteColor[] {
  return Object.entries(colorSystemMapping)
    .map(([hex, vendorCodes]) => {
      const rgb = hexToRgb(hex);
      if (!rgb) return null;

      return {
        colorId: hex.toUpperCase(),
        vendorCode: vendorCodes[colorSystem] ?? '?',
        hex: hex.toUpperCase(),
        rgb,
      };
    })
    .filter((item): item is PatternPaletteColor => item !== null);
}

export function getVendorCode(hex: string, colorSystem: ColorSystem): string {
  return colorSystemMapping[hex.toUpperCase()]?.[colorSystem] ?? '?';
}
