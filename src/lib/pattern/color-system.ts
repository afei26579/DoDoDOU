import mappingData from './colorSystemMapping.json';
import { beadBrandKeys, normalizeBeadBrandKey, type BeadBrandKey } from './brand';
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

export type BrandColor = {
  id: string;
  brandKey: BeadBrandKey;
  code: string;
  hex: string;
  rgb: PatternRgb;
  name?: string;
  material?: 'normal' | 'transparent' | 'glow' | 'pearl' | 'special';
  enabled: boolean;
};

type ColorMapping = Record<string, Partial<Record<BeadBrandKey, string>>>;

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
  const brandKey = normalizeBeadBrandKey(colorSystem);
  return Object.entries(colorSystemMapping)
    .map(([hex, vendorCodes]) => {
      const rgb = hexToRgb(hex);
      if (!rgb) return null;

      return {
        colorId: hex.toUpperCase(),
        vendorCode: vendorCodes[brandKey] ?? '?',
        hex: hex.toUpperCase(),
        rgb,
      };
    })
    .filter((item): item is PatternPaletteColor => item !== null);
}

export function getVendorCode(hex: string, colorSystem: ColorSystem): string {
  const brandKey = normalizeBeadBrandKey(colorSystem);
  return colorSystemMapping[hex.toUpperCase()]?.[brandKey] ?? '?';
}

export function getColorMappingByHex(hex: string) {
  return colorSystemMapping[hex.toUpperCase()] ?? null;
}

export function getBrandPalette(brandKeyInput: ColorSystem): BrandColor[] {
  const brandKey = normalizeBeadBrandKey(brandKeyInput);

  return Object.entries(colorSystemMapping)
    .map(([hex, vendorCodes]) => {
      const code = vendorCodes[brandKey];
      const rgb = hexToRgb(hex);
      if (!code || !rgb) return null;

      return {
        id: `${brandKey}:${code}`,
        brandKey,
        code,
        hex: hex.toUpperCase(),
        rgb,
        enabled: true,
      };
    })
    .filter((item): item is BrandColor => item !== null);
}

export function getColorByBrandCode(brandKeyInput: ColorSystem, code: string): BrandColor | null {
  const brandKey = normalizeBeadBrandKey(brandKeyInput);
  const normalizedCode = code.trim();

  for (const color of getBrandPalette(brandKey)) {
    if (color.code === normalizedCode) return color;
  }

  return null;
}

export function getAllBrandPalettes() {
  return Object.fromEntries(beadBrandKeys.map((brandKey) => [brandKey, getBrandPalette(brandKey)])) as Record<BeadBrandKey, BrandColor[]>;
}
