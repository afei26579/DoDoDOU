import type { LabColor } from './color-convert';
import type { PatternPaletteColorLab } from './palette-cache';
import type { PatternRgb } from './color-system';
import type { PatternResult } from '../../features/workshop/model/types';

export type RGBColor = PatternRgb;
export type { LabColor };

export type PatternCellCleanupAction = 'none' | 'color-merged' | 'region-replaced' | 'preserved';

export type WorkingCell = {
  x: number;
  y: number;
  index: number;
  sourceRgb: RGBColor | null;
  sourceLab: LabColor | null;
  variance: number;
  alphaRatio: number;
  isTransparent: boolean;
  matchedColorId: string;
  matchedVendorCode: string;
  matchedHex: string;
  matchedLab: LabColor | null;
  bestDeltaE: number;
  secondBestDeltaE: number;
  deltaGap: number;
  matchConfidence: number;
  cellConfidence: number;
  regionId?: number;
  cleanupAction: PatternCellCleanupAction;
  cleanupReason?: string;
};

export type PatternDebugInfo = {
  isolatedCellCount: number;
  smallBlockCount: number;
  cleanedCellCount: number;
  preservedCellCount: number;
  generationTimeMs: number;
  samplingTimeMs: number;
  matchingTimeMs: number;
  cleanupTimeMs: number;
  ciedeCallCount: number;
  topK: number;
  paletteCacheHit: boolean;
  avgDeltaE: number;
  p95DeltaE: number;
  extremeDeltaERatio: number;
  colorMergeChangedCellCount: number;
  colorMergeRemovedColorCount: number;
  regionCleanedCellCount: number;
};

export type PatternWorkingData = {
  width: number;
  height: number;
  cells: WorkingCell[];
  palette: PatternPaletteColorLab[];
  debug: PatternDebugInfo;
};

export type GeneratePatternCoreResult = {
  pattern: PatternResult;
  workingData: PatternWorkingData;
  debug: PatternDebugInfo;
};
