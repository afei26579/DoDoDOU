import type { WorkshopAdvancedConfig, WorkshopConfig } from '../../features/workshop/model/types';

export const DEFAULT_PATTERN_ADVANCED_CONFIG: WorkshopAdvancedConfig = {
  detailPreserve: 50,
  noiseReduction: 50,
  colorSimplify: 50,
  alphaSensitivity: 50,
};

export function clampAdvancedValue(value: unknown, fallback = 50) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function normalizePatternAdvancedConfig(value: unknown): WorkshopAdvancedConfig {
  const input = value && typeof value === 'object' ? value as Partial<WorkshopAdvancedConfig> : {};

  return {
    detailPreserve: clampAdvancedValue(input.detailPreserve, DEFAULT_PATTERN_ADVANCED_CONFIG.detailPreserve),
    noiseReduction: clampAdvancedValue(input.noiseReduction, DEFAULT_PATTERN_ADVANCED_CONFIG.noiseReduction),
    colorSimplify: clampAdvancedValue(input.colorSimplify, DEFAULT_PATTERN_ADVANCED_CONFIG.colorSimplify),
    alphaSensitivity: clampAdvancedValue(input.alphaSensitivity, DEFAULT_PATTERN_ADVANCED_CONFIG.alphaSensitivity),
  };
}

export function resolvePatternAdvancedConfig(config: Pick<WorkshopConfig, 'advanced'>): WorkshopAdvancedConfig {
  return normalizePatternAdvancedConfig(config.advanced);
}

export function getAdvancedOffset(value: number) {
  return (clampAdvancedValue(value) - 50) / 50;
}

