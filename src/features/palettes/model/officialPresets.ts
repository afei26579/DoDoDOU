import {
  beadBrandKeys,
  getBeadBrandLabel,
  normalizeBeadBrandKey,
  type BeadBrandKey,
} from '../../../lib/pattern/brand';
import { getBrandPalette, getColorByBrandCode, getColorMappingByHex } from '../../../lib/pattern/color-system';
import type { ColorPaletteSeries, OfficialColorPalettePreset, PalettePreviewColor } from './types';

type RawOfficialPalette = {
  id?: unknown;
  name?: unknown;
  baseBrand?: unknown;
  colorIds?: unknown;
  lastModified?: unknown;
};

const OFFICIAL_PALETTE_FILES = [
  '24色_副本_palette.json',
  '48色_副本_palette.json',
  '72色_副本_palette.json',
  '96色_副本_palette.json',
  '120色_副本_palette.json',
  '144色_副本_palette.json',
  '216色_副本_palette.json',
  '221色_副本_palette (1).json',
] as const;

function getPresetUrl(fileName: string) {
  return `/data/${encodeURIComponent(fileName)}`;
}

function normalizePresetName(name: string, colorCount: number) {
  const trimmed = name.trim().replace(/\s*副本(?:\s*\(\d+\))?$/u, '').trim();
  return trimmed || `${colorCount}色`;
}

function normalizeColorIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean)));
}

function normalizeOfficialPalette(raw: RawOfficialPalette, fileName: string): OfficialColorPalettePreset | null {
  const colorIds = normalizeColorIds(raw.colorIds);
  if (!colorIds.length) return null;

  const now = new Date().toISOString();
  const rawName = typeof raw.name === 'string' ? raw.name : '';
  const lastModified = typeof raw.lastModified === 'number' && Number.isFinite(raw.lastModified)
    ? raw.lastModified
    : Date.now();

  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `official-${colorIds.length}`,
    name: normalizePresetName(rawName, colorIds.length),
    baseBrand: normalizeBeadBrandKey(String(raw.baseBrand ?? '').toUpperCase(), 'MARD'),
    colorIds,
    source: 'official',
    fileName,
    lastModified,
    createdAt: new Date(lastModified).toISOString(),
    updatedAt: now,
  };
}

function convertColorIdsToBrand(
  colorIds: string[],
  sourceBrand: BeadBrandKey,
  targetBrand: BeadBrandKey,
) {
  if (sourceBrand === targetBrand) return [...colorIds];

  return normalizeColorIds(colorIds.flatMap((code) => {
    const sourceColor = getColorByBrandCode(sourceBrand, code);
    if (!sourceColor) return [];

    const targetCode = getColorMappingByHex(sourceColor.hex)?.[targetBrand];
    return targetCode ? [targetCode] : [];
  }));
}

function createBrandPreset(
  preset: OfficialColorPalettePreset,
  brandKey: BeadBrandKey,
): OfficialColorPalettePreset | null {
  const colorIds = convertColorIdsToBrand(preset.colorIds, preset.baseBrand, brandKey);
  if (!colorIds.length) return null;

  const isBaseBrand = brandKey === preset.baseBrand;
  return {
    ...preset,
    id: isBaseBrand ? preset.id : `${preset.id}-${brandKey.toLowerCase()}`,
    name: isBaseBrand ? preset.name : `${getBeadBrandLabel(brandKey)} ${preset.name}`,
    baseBrand: brandKey,
    colorIds,
  };
}

function createBrandPresets(preset: OfficialColorPalettePreset) {
  return beadBrandKeys.flatMap((brandKey) => {
    const brandPreset = createBrandPreset(preset, brandKey);
    return brandPreset ? [brandPreset] : [];
  });
}

function createAllColorsPreset(): OfficialColorPalettePreset {
  const colorIds = getBrandPalette('MARD').map((color) => color.code);
  const now = new Date().toISOString();

  return {
    id: 'official-all-colors',
    name: `${colorIds.length}色`,
    baseBrand: 'MARD',
    colorIds,
    source: 'official',
    fileName: 'colorSystemMapping.json',
    lastModified: Date.now(),
    createdAt: now,
    updatedAt: now,
  };
}

async function loadOfficialPresetFile(fileName: string) {
  const response = await fetch(getPresetUrl(fileName));
  if (!response.ok) {
    throw new Error(`加载 ${fileName} 失败`);
  }

  const preset = normalizeOfficialPalette(await response.json() as RawOfficialPalette, fileName);
  return preset ? createBrandPresets(preset) : [];
}

function compareOfficialPalettePresets(a: OfficialColorPalettePreset, b: OfficialColorPalettePreset) {
  if (a.colorIds.length !== b.colorIds.length) return a.colorIds.length - b.colorIds.length;

  const brandIndexA = beadBrandKeys.indexOf(a.baseBrand);
  const brandIndexB = beadBrandKeys.indexOf(b.baseBrand);
  if (brandIndexA !== brandIndexB) return brandIndexA - brandIndexB;

  return a.name.localeCompare(b.name, 'zh-Hans-CN');
}

export async function loadOfficialColorPalettePresets() {
  const results = await Promise.allSettled(OFFICIAL_PALETTE_FILES.map(loadOfficialPresetFile));
  const allColorPresets = createBrandPresets(createAllColorsPreset());

  return results
    .flatMap((result) => result.status === 'fulfilled' ? result.value : [])
    .concat(allColorPresets)
    .sort(compareOfficialPalettePresets);
}

export function getPalettePreviewColors(
  palette: Pick<ColorPaletteSeries, 'baseBrand' | 'colorIds'>,
  limit = 18,
): PalettePreviewColor[] {
  return palette.colorIds.slice(0, limit).flatMap((code) => {
    const color = getColorByBrandCode(palette.baseBrand, code);
    return color ? [{ code, hex: color.hex }] : [];
  });
}
