import type { BeadBrandKey } from './brand';
import { getVendorCode } from './color-system';
import type { PatternResult } from '../../features/workshop/model/types';

export type PatternColorRequirement = {
  colorId: string;
  brandKey: BeadBrandKey;
  code: string;
  hex: string;
  requiredQuantity: number;
  ownedQuantity?: number;
  missingQuantity?: number;
  status: 'enough' | 'missing' | 'unknown';
};

export function buildPatternColorRequirements(
  patternResult: PatternResult,
  brandKey: BeadBrandKey,
): PatternColorRequirement[] {
  return patternResult.palette
    .map((entry) => ({
      colorId: entry.colorId,
      brandKey,
      code: getVendorCode(entry.hex, brandKey),
      hex: entry.hex,
      requiredQuantity: entry.count,
      status: 'unknown' as const,
    }))
    .sort((a, b) => b.requiredQuantity - a.requiredQuantity);
}
