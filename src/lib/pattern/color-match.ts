import { labDistance, rgbToLab } from './color-convert';
import type { PatternRgb } from './color-system';
import { deltaE2000 } from './delta-e';
import type { PatternPaletteColorLab } from './palette-cache';

export type PatternColorMatch = {
  color: PatternPaletteColorLab;
  bestDeltaE: number;
  secondBestDeltaE: number;
  deltaGap: number;
};

export function findClosestPaletteColorP0(target: PatternRgb, palette: PatternPaletteColorLab[], topK: number): PatternColorMatch {
  const targetLab = rgbToLab(target);
  const candidates = palette
    .map((color) => ({
      color,
      preDistance: labDistance(targetLab, color.lab),
    }))
    .sort((a, b) => a.preDistance - b.preDistance)
    .slice(0, Math.max(1, topK));

  let best = candidates[0]?.color ?? palette[0];
  let secondBestDeltaE = Number.POSITIVE_INFINITY;
  let bestDeltaE = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const deltaE = deltaE2000(targetLab, candidate.color.lab);
    if (deltaE < bestDeltaE) {
      secondBestDeltaE = bestDeltaE;
      bestDeltaE = deltaE;
      best = candidate.color;
    } else if (deltaE < secondBestDeltaE) {
      secondBestDeltaE = deltaE;
    }
  }

  if (!Number.isFinite(secondBestDeltaE)) {
    secondBestDeltaE = bestDeltaE;
  }

  return {
    color: best,
    bestDeltaE,
    secondBestDeltaE,
    deltaGap: Math.max(0, secondBestDeltaE - bestDeltaE),
  };
}
