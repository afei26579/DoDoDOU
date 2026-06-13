import type { PatternResult, WorkshopConfig } from '../../features/workshop/model/types';
import { defaultWorkshopConfig } from '../../features/workshop/model/defaults';
import { isBeadBrandKey } from '../pattern/brand';
import { normalizePatternAdvancedConfig } from '../pattern/advanced-config';

export const DODOUDOU_PATTERN_EXPORT_APP = 'dodoudou';
export const DODOUDOU_PATTERN_EXPORT_VERSION = 1;

export type DodoudouPatternExportDocument = {
  app: typeof DODOUDOU_PATTERN_EXPORT_APP;
  version: typeof DODOUDOU_PATTERN_EXPORT_VERSION;
  createdAt: string;
  patternResult: PatternResult;
  config: WorkshopConfig;
  meta?: {
    format: 'dodoudou-pattern-export';
    patternName?: string;
    authorName?: string;
  };
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizePositiveInteger(value: unknown, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.round(value));
}

function normalizeNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeWorkshopStyle(value: unknown): WorkshopConfig['style'] {
  return value === '写实' || value === '动漫' || value === '极简'
    ? value
    : defaultWorkshopConfig.style;
}

function normalizeAlgorithm(value: unknown): WorkshopConfig['algorithm'] {
  return value === 'legacy' || value === 'perceptual-p0'
    ? value
    : defaultWorkshopConfig.algorithm;
}

export function isDodoudouPatternExportLike(
  value: unknown,
): value is Record<string, unknown> & { app: typeof DODOUDOU_PATTERN_EXPORT_APP } {
  return isPlainObject(value) && value.app === DODOUDOU_PATTERN_EXPORT_APP;
}

export function getDodoudouPatternExportVersion(value: unknown) {
  if (!isPlainObject(value)) return null;
  return typeof value.version === 'number' ? value.version : null;
}

export function normalizeDodoudouPatternExportConfig(value: unknown): WorkshopConfig | null {
  if (!isPlainObject(value)) return null;

  const brand = typeof value.brand === 'string' && isBeadBrandKey(value.brand)
    ? value.brand
    : defaultWorkshopConfig.brand;

  return {
    ...defaultWorkshopConfig,
    brand,
    canvasSize: normalizePositiveInteger(value.canvasSize, defaultWorkshopConfig.canvasSize),
    style: normalizeWorkshopStyle(value.style),
    colorMergeThreshold: normalizeNumber(value.colorMergeThreshold, defaultWorkshopConfig.colorMergeThreshold),
    algorithm: normalizeAlgorithm(value.algorithm),
    advanced: normalizePatternAdvancedConfig(isPlainObject(value.advanced) ? value.advanced : defaultWorkshopConfig.advanced),
  };
}

export function createDodoudouPatternExportDocument(params: {
  patternResult: PatternResult;
  config: WorkshopConfig;
  patternName?: string;
  authorName?: string;
  createdAt?: string;
}): DodoudouPatternExportDocument {
  return {
    app: DODOUDOU_PATTERN_EXPORT_APP,
    version: DODOUDOU_PATTERN_EXPORT_VERSION,
    createdAt: params.createdAt ?? new Date().toISOString(),
    patternResult: params.patternResult,
    config: {
      ...defaultWorkshopConfig,
      ...params.config,
      advanced: normalizePatternAdvancedConfig(params.config.advanced),
    },
    meta: {
      format: 'dodoudou-pattern-export',
      patternName: params.patternName?.trim() || undefined,
      authorName: params.authorName?.trim() || undefined,
    },
  };
}
