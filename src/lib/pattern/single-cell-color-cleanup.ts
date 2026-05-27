import type { PatternCell, PatternPaletteEntry, PatternResult } from '../../features/workshop/model/types';
import { rgbToLab } from './color-convert';
import { hexToRgb } from './color-system';
import { deltaE2000 } from './delta-e';

export const SINGLE_CELL_CLEANUP_MIN_SIZE = 50;

export type PatternColorCleanupSelection = {
  code: string;
  hex: string;
};

export type SingleCellColorCleanupResult = {
  newPatternResult: PatternResult;
  replacedCellCount: number;
  removedColorCount: number;
  eligibleColorCount: number;
  skippedReason: 'pattern-too-small' | 'no-single-cell-colors' | 'no-selected-colors' | 'no-target-colors' | null;
};

type ColorSummary = {
  key: string;
  colorId: string;
  vendorCode: string;
  hex: string;
  count: number;
};

function isDrawableCell(cell: PatternCell) {
  return !cell.isExternal && cell.hex !== 'transparent';
}

function getColorKey(cell: Pick<PatternCell, 'hex' | 'vendorCode'>) {
  return `${cell.hex.trim().toUpperCase()}-${cell.vendorCode.trim().toUpperCase()}`;
}

function summarizeCells(cells: PatternCell[]) {
  const summaries = new Map<string, ColorSummary>();

  for (const cell of cells) {
    if (!isDrawableCell(cell)) continue;

    const hex = cell.hex.toUpperCase();
    const key = getColorKey({ hex, vendorCode: cell.vendorCode });
    const current = summaries.get(key);

    if (current) {
      current.count += 1;
      continue;
    }

    summaries.set(key, {
      key,
      colorId: cell.colorId,
      vendorCode: cell.vendorCode,
      hex,
      count: 1,
    });
  }

  return [...summaries.values()];
}

function rebuildPalette(cells: PatternCell[]): PatternPaletteEntry[] {
  return summarizeCells(cells)
    .map(({ key: _key, ...entry }) => entry)
    .sort((a, b) => b.count - a.count);
}

function rebuildPatternResult(patternResult: PatternResult, cells: PatternCell[]): PatternResult {
  const palette = rebuildPalette(cells);

  return {
    ...patternResult,
    cells,
    palette,
    stats: {
      totalCells: palette.reduce((sum, item) => sum + item.count, 0),
      colorCount: palette.length,
    },
  };
}

function findClosestTarget(source: ColorSummary, targets: ColorSummary[]) {
  const sourceRgb = hexToRgb(source.hex);
  if (!sourceRgb) return null;

  const sourceLab = rgbToLab(sourceRgb);
  let bestTarget: ColorSummary | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;

  for (const target of targets) {
    const targetRgb = hexToRgb(target.hex);
    if (!targetRgb) continue;

    const delta = deltaE2000(sourceLab, rgbToLab(targetRgb));
    if (delta < bestDelta) {
      bestDelta = delta;
      bestTarget = target;
    }
  }

  return bestTarget;
}

function cleanupPatternColors(
  patternResult: PatternResult,
  sourceColors: ColorSummary[],
  targetColors: ColorSummary[],
  noSourceReason: 'no-single-cell-colors' | 'no-selected-colors',
): SingleCellColorCleanupResult {
  const baseResult: SingleCellColorCleanupResult = {
    newPatternResult: patternResult,
    replacedCellCount: 0,
    removedColorCount: 0,
    eligibleColorCount: 0,
    skippedReason: null,
  };

  if (Math.max(patternResult.width, patternResult.height) <= SINGLE_CELL_CLEANUP_MIN_SIZE) {
    return {
      ...baseResult,
      skippedReason: 'pattern-too-small',
    };
  }

  if (sourceColors.length === 0) {
    return {
      ...baseResult,
      skippedReason: noSourceReason,
    };
  }

  if (targetColors.length === 0) {
    return {
      ...baseResult,
      eligibleColorCount: sourceColors.length,
      skippedReason: 'no-target-colors',
    };
  }

  const replacements = new Map<string, ColorSummary>();
  for (const source of sourceColors) {
    const target = findClosestTarget(source, targetColors);
    if (target) replacements.set(source.key, target);
  }

  if (replacements.size === 0) {
    return {
      ...baseResult,
      eligibleColorCount: sourceColors.length,
      skippedReason: 'no-target-colors',
    };
  }

  let replacedCellCount = 0;
  const nextCells = patternResult.cells.map((cell) => {
    if (!isDrawableCell(cell)) return cell;

    const replacement = replacements.get(getColorKey(cell));
    if (!replacement) return cell;

    replacedCellCount += 1;
    return {
      ...cell,
      colorId: replacement.colorId,
      vendorCode: replacement.vendorCode,
      hex: replacement.hex,
    };
  });

  return {
    newPatternResult: rebuildPatternResult(patternResult, nextCells),
    replacedCellCount,
    removedColorCount: replacements.size,
    eligibleColorCount: sourceColors.length,
    skippedReason: null,
  };
}

export function cleanupSingleCellPatternColors(patternResult: PatternResult): SingleCellColorCleanupResult {
  const summaries = summarizeCells(patternResult.cells);
  const singleCellColors = summaries.filter((summary) => summary.count === 1);
  const targetColors = summaries.filter((summary) => summary.count >= 2);

  return cleanupPatternColors(patternResult, singleCellColors, targetColors, 'no-single-cell-colors');
}

export function cleanupSelectedPatternColors(
  patternResult: PatternResult,
  selectedColors: PatternColorCleanupSelection[],
): SingleCellColorCleanupResult {
  const selectedKeys = new Set<string>();
  const selectedHexes = new Set<string>();

  selectedColors.forEach((color) => {
    const hex = color.hex.trim().toUpperCase();
    const code = color.code.trim().toUpperCase();
    if (!hex || hex === 'TRANSPARENT') return;

    selectedHexes.add(hex);
    if (code && code !== '?') {
      selectedKeys.add(getColorKey({ hex, vendorCode: code }));
    }
  });

  const summaries = summarizeCells(patternResult.cells);
  const sourceColors = summaries.filter((summary) => (
    selectedKeys.has(summary.key) || selectedHexes.has(summary.hex)
  ));
  const targetColors = summaries.filter((summary) => (
    !selectedKeys.has(summary.key) && !selectedHexes.has(summary.hex)
  ));

  return cleanupPatternColors(patternResult, sourceColors, targetColors, 'no-selected-colors');
}
