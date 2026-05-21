import type { WorkingCell } from './algo-types';
import { getAdvancedOffset } from './advanced-config';
import { deltaE2000 } from './delta-e';
import type { PatternPaletteColorLab } from './palette-cache';
import type { PatternSizeTier } from './pattern-size';
import type { WorkshopAdvancedConfig } from '../../features/workshop/model/types';

type RegionInfo = {
  id: number;
  colorId: string;
  indices: number[];
  avgConfidence: number;
  avgDeltaE: number;
  avgVariance: number;
  avgAlphaRatio: number;
};

export type RegionCleanupStats = {
  cleanedCellCount: number;
  preservedCellCount: number;
};

function getCleanupParams(sizeTier: PatternSizeTier, advanced: WorkshopAdvancedConfig) {
  const detailOffset = getAdvancedOffset(advanced.detailPreserve);
  const alphaOffset = getAdvancedOffset(advanced.alphaSensitivity);
  const tune = (base: {
    maxArea: number;
    maxNeighborDeltaE: number;
    highConfidence: number;
    dominanceRatio: number;
    transparentRatio: number;
    lowAlphaRatio: number;
  }) => ({
    maxArea: Math.max(1, Math.round(base.maxArea * (1 - detailOffset * 0.45))),
    maxNeighborDeltaE: Math.max(2.8, base.maxNeighborDeltaE - detailOffset * 1.2),
    highConfidence: Math.max(0.28, Math.min(0.82, base.highConfidence - detailOffset * 0.12)),
    dominanceRatio: Math.max(0.44, Math.min(0.72, base.dominanceRatio + detailOffset * 0.08)),
    transparentRatio: Math.max(0.48, Math.min(0.74, base.transparentRatio - alphaOffset * 0.08)),
    lowAlphaRatio: Math.max(0.22, Math.min(0.66, base.lowAlphaRatio + alphaOffset * 0.08)),
  });

  if (sizeTier === 'small') {
    return tune({ maxArea: 1, maxNeighborDeltaE: 4.5, highConfidence: 0.52, dominanceRatio: 0.58, transparentRatio: 0.58, lowAlphaRatio: 0.52 });
  }
  if (sizeTier === 'medium') {
    return tune({ maxArea: 2, maxNeighborDeltaE: 5.5, highConfidence: 0.6, dominanceRatio: 0.55, transparentRatio: 0.62, lowAlphaRatio: 0.45 });
  }
  return tune({ maxArea: 4, maxNeighborDeltaE: 6.5, highConfidence: 0.64, dominanceRatio: 0.52, transparentRatio: 0.66, lowAlphaRatio: 0.38 });
}

function getNeighborIndices(index: number, width: number, height: number) {
  const x = index % width;
  const y = Math.floor(index / width);
  const neighbors: number[] = [];

  if (x > 0) neighbors.push(index - 1);
  if (x < width - 1) neighbors.push(index + 1);
  if (y > 0) neighbors.push(index - width);
  if (y < height - 1) neighbors.push(index + width);

  return neighbors;
}

function collectRegions(cells: WorkingCell[], width: number, height: number): RegionInfo[] {
  const visited = new Set<number>();
  const regions: RegionInfo[] = [];
  let nextRegionId = 1;

  for (const cell of cells) {
    if (cell.isTransparent || visited.has(cell.index)) continue;

    const queue = [cell.index];
    const indices: number[] = [];
    visited.add(cell.index);

    while (queue.length > 0) {
      const currentIndex = queue.shift();
      if (currentIndex === undefined) continue;
      const currentCell = cells[currentIndex];
      indices.push(currentIndex);

      for (const neighborIndex of getNeighborIndices(currentIndex, width, height)) {
        if (visited.has(neighborIndex)) continue;
        const neighbor = cells[neighborIndex];
        if (neighbor.isTransparent || neighbor.matchedColorId !== currentCell.matchedColorId) continue;
        visited.add(neighborIndex);
        queue.push(neighborIndex);
      }
    }

    const confidenceTotal = indices.reduce((sum, index) => sum + cells[index].cellConfidence, 0);
    const deltaTotal = indices.reduce((sum, index) => sum + cells[index].bestDeltaE, 0);
    const varianceTotal = indices.reduce((sum, index) => sum + cells[index].variance, 0);
    const alphaTotal = indices.reduce((sum, index) => sum + cells[index].alphaRatio, 0);

    regions.push({
      id: nextRegionId,
      colorId: cell.matchedColorId,
      indices,
      avgConfidence: confidenceTotal / indices.length,
      avgDeltaE: deltaTotal / indices.length,
      avgVariance: varianceTotal / indices.length,
      avgAlphaRatio: alphaTotal / indices.length,
    });
    nextRegionId += 1;
  }

  return regions;
}

function getDominantNeighbor(params: {
  region: RegionInfo;
  cells: WorkingCell[];
  width: number;
  height: number;
}) {
  const { region, cells, width, height } = params;
  const regionIndexSet = new Set(region.indices);
  const counts = new Map<string, number>();

  for (const index of region.indices) {
    for (const neighborIndex of getNeighborIndices(index, width, height)) {
      if (regionIndexSet.has(neighborIndex)) continue;
      const neighbor = cells[neighborIndex];
      if (neighbor.isTransparent) continue;
      counts.set(neighbor.matchedColorId, (counts.get(neighbor.matchedColorId) ?? 0) + 1);
    }
  }

  let bestColorId = '';
  let bestCount = 0;
  let totalCount = 0;

  for (const [colorId, count] of counts) {
    totalCount += count;
    if (count > bestCount) {
      bestColorId = colorId;
      bestCount = count;
    }
  }

  return {
    colorId: bestColorId,
    count: bestCount,
    totalCount,
    ratio: totalCount > 0 ? bestCount / totalCount : 0,
  };
}

function getTransparentNeighborRatio(region: RegionInfo, cells: WorkingCell[], width: number, height: number) {
  const regionIndexSet = new Set(region.indices);
  let transparentCount = 0;
  let totalCount = 0;

  for (const index of region.indices) {
    for (const neighborIndex of getNeighborIndices(index, width, height)) {
      if (regionIndexSet.has(neighborIndex)) continue;
      totalCount += 1;
      if (cells[neighborIndex].isTransparent) transparentCount += 1;
    }
  }

  return totalCount > 0 ? transparentCount / totalCount : 0;
}

export function cleanupSmallColorRegions(params: {
  cells: WorkingCell[];
  width: number;
  height: number;
  palette: PatternPaletteColorLab[];
  sizeTier: PatternSizeTier;
  advanced: WorkshopAdvancedConfig;
}): { cells: WorkingCell[]; stats: RegionCleanupStats } {
  const { cells, width, height, palette, sizeTier, advanced } = params;
  const cleanupParams = getCleanupParams(sizeTier, advanced);
  const paletteByColorId = new Map(palette.map((color) => [color.colorId, color] as const));
  const regions = collectRegions(cells, width, height);
  const nextCells = cells.map((cell) => ({ ...cell }));
  let cleanedCellCount = 0;
  let preservedCellCount = 0;

  for (const region of regions) {
    for (const index of region.indices) {
      nextCells[index].regionId = region.id;
    }

    if (region.indices.length > cleanupParams.maxArea) continue;

    const sourceColor = paletteByColorId.get(region.colorId);
    if (!sourceColor) continue;

    const transparentNeighborRatio = getTransparentNeighborRatio(region, cells, width, height);
    if (
      transparentNeighborRatio >= cleanupParams.transparentRatio &&
      region.avgAlphaRatio <= cleanupParams.lowAlphaRatio &&
      region.avgConfidence < cleanupParams.highConfidence + 0.08
    ) {
      cleanedCellCount += region.indices.length;
      for (const index of region.indices) {
        nextCells[index] = {
          ...nextCells[index],
          isTransparent: true,
          matchedColorId: 'transparent',
          matchedVendorCode: '',
          matchedHex: 'transparent',
          matchedLab: null,
          cleanupAction: 'region-replaced',
          cleanupReason: 'removed low-alpha island near transparent background',
        };
      }
      continue;
    }

    if (region.avgConfidence >= cleanupParams.highConfidence && region.avgVariance <= 10) {
      preservedCellCount += region.indices.length;
      for (const index of region.indices) {
        nextCells[index].cleanupAction = 'preserved';
        nextCells[index].cleanupReason = 'high-confidence small region';
      }
      continue;
    }

    const dominant = getDominantNeighbor({ region, cells, width, height });
    const targetColor = paletteByColorId.get(dominant.colorId);
    if (!targetColor || dominant.ratio < cleanupParams.dominanceRatio) {
      preservedCellCount += region.indices.length;
      for (const index of region.indices) {
        nextCells[index].cleanupAction = 'preserved';
        nextCells[index].cleanupReason = 'no dominant neighbor';
      }
      continue;
    }

    const neighborDeltaE = deltaE2000(sourceColor.lab, targetColor.lab);
    const maxDeltaE = region.avgConfidence < 0.36 ? cleanupParams.maxNeighborDeltaE + 1.5 : cleanupParams.maxNeighborDeltaE;
    if (neighborDeltaE > maxDeltaE) {
      preservedCellCount += region.indices.length;
      for (const index of region.indices) {
        nextCells[index].cleanupAction = 'preserved';
        nextCells[index].cleanupReason = 'neighbor color too far';
      }
      continue;
    }

    cleanedCellCount += region.indices.length;
    for (const index of region.indices) {
      nextCells[index] = {
        ...nextCells[index],
        matchedColorId: targetColor.colorId,
        matchedVendorCode: targetColor.vendorCode,
        matchedHex: targetColor.hex,
        matchedLab: targetColor.lab,
        cleanupAction: 'region-replaced',
        cleanupReason: `replaced by dominant neighbor ${targetColor.colorId}`,
      };
    }
  }

  return {
    cells: nextCells,
    stats: {
      cleanedCellCount,
      preservedCellCount,
    },
  };
}
