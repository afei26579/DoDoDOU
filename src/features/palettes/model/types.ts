import type { BeadBrandKey } from '../../../lib/pattern/brand';

export type ColorPaletteSource = 'official' | 'custom';

export type ColorPaletteSeries = {
  id: string;
  name: string;
  baseBrand: BeadBrandKey;
  colorIds: string[];
  source: ColorPaletteSource;
  sourcePresetId?: string;
  lastModified: number;
  createdAt: string;
  updatedAt: string;
};

export type OfficialColorPalettePreset = ColorPaletteSeries & {
  source: 'official';
  fileName: string;
};

export type ColorPaletteCreateDraft = {
  mode: 'create';
  name: string;
  baseBrand: BeadBrandKey;
  colorIds: string[];
  sourcePresetId?: string;
};

export type PalettePreviewColor = {
  code: string;
  hex: string;
};
