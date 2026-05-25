import type { WorkingCell } from './algo-types';
import { clampAdvancedValue } from './advanced-config';
import { deltaE2000 } from './delta-e';
import type { PatternPaletteColorLab } from './palette-cache';
import type { PatternSizeTier } from './pattern-size';
import type { WorkshopStyle } from '../../features/workshop/model/types';

type ColorSummary = {
  colorId: string;
  count: number;
  avgConfidence: number;
};

export type ColorMergeStats = {
  changedCellCount: number;
  removedColorCount: number;
};

function getEffectiveMergeInput(input: number, colorSimplify: number) {
  return Math.max(0, Math.min(100, input + (clampAdvancedValue(colorSimplify) - 50) * 0.7));
}

function getMergeDeltaThreshold(input: number, style: WorkshopStyle) {
  const normalized = Math.max(0, Math.min(100, input)) / 100;
  const styleBonus = style === '极简' ? 0.8 : style === '动漫' ? 0.35 : 0;
  return 1.4 + normalized * 3.5 + styleBonus;
}

function getRareCountLimit(totalCells: number, sizeTier: PatternSizeTier, input: number) {
  const normalized = Math.max(0, Math.min(100, input)) / 100;
  const tierFactor = sizeTier === 'small' ? 0.002 : sizeTier === 'medium' ? 0.003 : 0.004;
  return Math.max(2, Math.floor(totalCells * (tierFactor + normalized * 0.003)));
}

function summarizeColors(cells: WorkingCell[]) {
  const summaries = new Map<string, { count: number; confidenceTotal: number }>();

  for (const cell of cells) {
    if (cell.isTransparent) continue;
    const current = summaries.get(cell.matchedColorId) ?? { count: 0, confidenceTotal: 0 };
    current.count += 1;
    current.confidenceTotal += cell.cellConfidence;
    summaries.set(cell.matchedColorId, current);
  }

  return [...summaries.entries()].map(([colorId, value]): ColorSummary => ({
    colorId,
    count: value.count,
    avgConfidence: value.confidenceTotal / Math.max(1, value.count),
  }));
}

export function mergeSimilarWorkingColors(params: {
  cells: WorkingCell[];
  palette: PatternPaletteColorLab[];
  sizeTier: PatternSizeTier;
  colorMergeThreshold: number;
  colorSimplify: number;
  style: WorkshopStyle;
}): { cells: WorkingCell[]; stats: ColorMergeStats } {
  const { cells, palette, sizeTier, colorMergeThreshold, colorSimplify, style } = params;
  const paletteByColorId = new Map(palette.map((color) => [color.colorId, color] as const));
  const totalDrawableCells = cells.filter((cell) => !cell.isTransparent).length;
  const effectiveMergeInput = getEffectiveMergeInput(colorMergeThreshold, colorSimplify);
  const rareCountLimit = getRareCountLimit(totalDrawableCells, sizeTier, effectiveMergeInput);
  const deltaThreshold = getMergeDeltaThreshold(effectiveMergeInput, style);
  const summaries = summarizeColors(cells).sort((a, b) => a.count - b.count);
  const summaryByColorId = new Map(summaries.map((summary) => [summary.colorId, summary] as const));
  const replacements = new Map<string, PatternPaletteColorLab>();

  for (const source of summaries) {
    if (source.count > rareCountLimit) continue;
    if (source.avgConfidence > 0.62 && source.count > 2) continue;

    const sourceColor = paletteByColorId.get(source.colorId);
    if (!sourceColor) continue;

    let bestTarget: PatternPaletteColorLab | null = null;
    let bestDelta = Number.POSITIVE_INFINITY;

    for (const target of summaries) {
      if (target.colorId === source.colorId) continue;
      if (replacements.has(target.colorId)) continue;
      if (target.count < source.count) continue;

      const targetColor = paletteByColorId.get(target.colorId);
      if (!targetColor) continue;

      const delta = deltaE2000(sourceColor.lab, targetColor.lab);
      if (delta < bestDelta) {
        bestDelta = delta;
        bestTarget = targetColor;
      }
    }

    if (!bestTarget || bestDelta > deltaThreshold) continue;

    const targetSummary = summaryByColorId.get(bestTarget.colorId);
    const lowRisk =
      source.avgConfidence < 0.56 ||
      source.count <= 2 ||
      bestDelta <= deltaThreshold * 0.65 ||
      (targetSummary && targetSummary.count >= source.count * 3);

    if (lowRisk) {
      replacements.set(source.colorId, bestTarget);
    }
  }

  if (replacements.size === 0) {
    return {
      cells,
      stats: {
        changedCellCount: 0,
        removedColorCount: 0,
      },
    };
  }

  let changedCellCount = 0;
  const mergedCells = cells.map((cell) => {
    const replacement = replacements.get(cell.matchedColorId);
    if (!replacement) return cell;
    changedCellCount += 1;

    return {
      ...cell,
      matchedColorId: replacement.colorId,
      matchedVendorCode: replacement.vendorCode,
      matchedHex: replacement.hex,
      matchedLab: replacement.lab,
      cleanupAction: 'color-merged' as const,
      cleanupReason: `merged near color ${replacement.colorId}`,
    };
  });

  return {
    cells: mergedCells,
    stats: {
      changedCellCount,
      removedColorCount: replacements.size,
    },
  };
}
