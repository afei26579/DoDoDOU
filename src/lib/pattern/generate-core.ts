import type { GeneratePatternCoreResult, WorkingCell } from './algo-types';
import { resolvePatternAdvancedConfig } from './advanced-config';
import { applyCellConfidence } from './confidence';
import { findClosestPaletteColorByLabP0 } from './color-match';
import { mergeSimilarWorkingColors } from './color-merge';
import type { PatternPaletteColor } from './color-system';
import {
  calculateDeltaStats,
  calculateRegionSizeStats,
  createEmptyDebugInfo,
} from './debug-stats';
import { sampleGridCells } from './grid-sampling';
import { getPaletteLabCache } from './palette-cache';
import { getP0TopK, getPatternSizeTier } from './pattern-size';
import { cleanupSmallColorRegions } from './region-cleanup';
import type { PatternResult, WorkshopConfig } from '../../features/workshop/model/types';

type GeneratePatternCoreParams = {
  imageData: ImageData;
  canvasSize: number;
  palette: PatternPaletteColor[];
  config: WorkshopConfig;
};

function getTimestamp() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
}

function roundMs(value: number) {
  return Math.round(value * 10) / 10;
}

function toPatternResult(width: number, height: number, cells: WorkingCell[]): PatternResult {
  const patternCells = cells.map((cell) => {
    if (cell.isTransparent || cell.matchedHex === 'transparent') {
      return {
        x: cell.x,
        y: cell.y,
        colorId: 'transparent',
        vendorCode: '',
        hex: 'transparent',
        isExternal: true,
      };
    }

    return {
      x: cell.x,
      y: cell.y,
      colorId: cell.matchedColorId,
      vendorCode: cell.matchedVendorCode,
      hex: cell.matchedHex,
    };
  });

  const paletteCounts = new Map<string, { colorId: string; hex: string; vendorCode: string; count: number }>();
  for (const cell of patternCells) {
    if (cell.isExternal || cell.hex === 'transparent') continue;
    const key = cell.colorId;
    const current = paletteCounts.get(key);
    if (current) {
      current.count += 1;
    } else {
      paletteCounts.set(key, {
        colorId: cell.colorId,
        hex: cell.hex,
        vendorCode: cell.vendorCode,
        count: 1,
      });
    }
  }

  return {
    width,
    height,
    cells: patternCells,
    palette: [...paletteCounts.values()].sort((a, b) => b.count - a.count),
    stats: {
      totalCells: patternCells.filter((cell) => !cell.isExternal && cell.hex !== 'transparent').length,
      colorCount: paletteCounts.size,
    },
  };
}

export function generatePatternCore(params: GeneratePatternCoreParams): GeneratePatternCoreResult {
  const generationStart = getTimestamp();
  const { imageData, canvasSize, palette, config } = params;
  const width = canvasSize;
  const height = canvasSize;
  const sizeTier = getPatternSizeTier(canvasSize);
  const topK = getP0TopK(sizeTier);
  const paletteCache = getPaletteLabCache(palette);
  const advanced = resolvePatternAdvancedConfig(config);
  const debug = createEmptyDebugInfo({ topK, paletteCacheHit: paletteCache.cacheHit });

  const samplingStart = getTimestamp();
  let cells = sampleGridCells({ imageData, width, height, sizeTier, style: config.style, advanced });
  debug.samplingTimeMs = roundMs(getTimestamp() - samplingStart);

  const matchingStart = getTimestamp();
  let ciedeCallCount = 0;
  cells = cells.map((cell) => {
    if (cell.isTransparent || !cell.sourceLab) return cell;
    const match = findClosestPaletteColorByLabP0(cell.sourceLab, paletteCache.colors, topK);
    ciedeCallCount += match.ciedeCallCount;

    return {
      ...cell,
      matchedColorId: match.color.colorId,
      matchedVendorCode: match.color.vendorCode,
      matchedHex: match.color.hex,
      matchedLab: match.color.lab,
      bestDeltaE: match.bestDeltaE,
      secondBestDeltaE: match.secondBestDeltaE,
      deltaGap: match.deltaGap,
    };
  }).map(applyCellConfidence);
  debug.ciedeCallCount = ciedeCallCount;
  debug.matchingTimeMs = roundMs(getTimestamp() - matchingStart);

  const cleanupStart = getTimestamp();
  const merged = mergeSimilarWorkingColors({
    cells,
    palette: paletteCache.colors,
    sizeTier,
    colorMergeThreshold: config.colorMergeThreshold,
    colorSimplify: advanced.colorSimplify,
    style: config.style,
  });
  cells = merged.cells;
  debug.colorMergeChangedCellCount = merged.stats.changedCellCount;
  debug.colorMergeRemovedColorCount = merged.stats.removedColorCount;

  const cleaned = cleanupSmallColorRegions({
    cells,
    width,
    height,
    palette: paletteCache.colors,
    sizeTier,
    advanced,
  });
  cells = cleaned.cells;
  debug.cleanedCellCount = merged.stats.changedCellCount + cleaned.stats.cleanedCellCount;
  debug.preservedCellCount = cleaned.stats.preservedCellCount;
  debug.regionCleanedCellCount = cleaned.stats.cleanedCellCount;
  debug.cleanupTimeMs = roundMs(getTimestamp() - cleanupStart);

  const deltaStats = calculateDeltaStats(cells);
  const regionStats = calculateRegionSizeStats(cells, width, height);
  debug.avgDeltaE = deltaStats.avgDeltaE;
  debug.p95DeltaE = deltaStats.p95DeltaE;
  debug.extremeDeltaERatio = deltaStats.extremeDeltaERatio;
  debug.isolatedCellCount = regionStats.isolatedCellCount;
  debug.smallBlockCount = regionStats.smallBlockCount;
  debug.generationTimeMs = roundMs(getTimestamp() - generationStart);

  const pattern = toPatternResult(width, height, cells);

  return {
    pattern,
    workingData: {
      width,
      height,
      cells,
      palette: paletteCache.colors,
      debug,
    },
    debug,
  };
}
