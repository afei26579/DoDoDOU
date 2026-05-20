export type PatternSizeTier = 'small' | 'medium' | 'large';

export function getPatternSizeTier(canvasSize: number): PatternSizeTier {
  if (canvasSize <= 52) return 'small';
  if (canvasSize <= 104) return 'medium';
  return 'large';
}

export function getP0TopK(sizeTier: PatternSizeTier) {
  if (sizeTier === 'small') return 8;
  if (sizeTier === 'medium') return 10;
  return 12;
}
