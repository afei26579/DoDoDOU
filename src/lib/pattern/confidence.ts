import type { WorkingCell } from './algo-types';

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function calculateMatchConfidence(params: {
  bestDeltaE: number;
  secondBestDeltaE: number;
  deltaGap: number;
  variance: number;
  alphaRatio: number;
}) {
  const deltaScore = 1 - clamp01((params.bestDeltaE - 2) / 24);
  const gapScore = clamp01(params.deltaGap / 10);
  const varianceScore = 1 - clamp01(params.variance / 18);
  const alphaScore = clamp01((params.alphaRatio - 0.12) / 0.88);
  const matchConfidence = clamp01(deltaScore * 0.7 + gapScore * 0.3);
  const cellConfidence = clamp01(matchConfidence * 0.62 + varianceScore * 0.26 + alphaScore * 0.12);

  return {
    matchConfidence,
    cellConfidence,
  };
}

export function applyCellConfidence(cell: WorkingCell): WorkingCell {
  if (cell.isTransparent) {
    return {
      ...cell,
      matchConfidence: 0,
      cellConfidence: 0,
    };
  }

  return {
    ...cell,
    ...calculateMatchConfidence({
      bestDeltaE: cell.bestDeltaE,
      secondBestDeltaE: cell.secondBestDeltaE,
      deltaGap: cell.deltaGap,
      variance: cell.variance,
      alphaRatio: cell.alphaRatio,
    }),
  };
}
