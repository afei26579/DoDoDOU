import type { PatternDebugInfo, WorkingCell } from './algo-types';

type RegionSizeStats = {
  isolatedCellCount: number;
  smallBlockCount: number;
};

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

export function createEmptyDebugInfo(params: { topK: number; paletteCacheHit: boolean }): PatternDebugInfo {
  return {
    isolatedCellCount: 0,
    smallBlockCount: 0,
    cleanedCellCount: 0,
    preservedCellCount: 0,
    generationTimeMs: 0,
    samplingTimeMs: 0,
    matchingTimeMs: 0,
    cleanupTimeMs: 0,
    ciedeCallCount: 0,
    topK: params.topK,
    paletteCacheHit: params.paletteCacheHit,
    avgDeltaE: 0,
    p95DeltaE: 0,
    extremeDeltaERatio: 0,
    colorMergeChangedCellCount: 0,
    colorMergeRemovedColorCount: 0,
    regionCleanedCellCount: 0,
  };
}

export function calculateDeltaStats(cells: WorkingCell[]) {
  const values = cells
    .filter((cell) => !cell.isTransparent && Number.isFinite(cell.bestDeltaE))
    .map((cell) => cell.bestDeltaE)
    .sort((a, b) => a - b);

  if (values.length === 0) {
    return {
      avgDeltaE: 0,
      p95DeltaE: 0,
      extremeDeltaERatio: 0,
    };
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  const p95Index = Math.min(values.length - 1, Math.floor(values.length * 0.95));
  const extremeCount = values.filter((value) => value >= 18).length;

  return {
    avgDeltaE: total / values.length,
    p95DeltaE: values[p95Index],
    extremeDeltaERatio: extremeCount / values.length,
  };
}

export function calculateRegionSizeStats(cells: WorkingCell[], width: number, height: number): RegionSizeStats {
  const visited = new Set<number>();
  let isolatedCellCount = 0;
  let smallBlockCount = 0;

  for (const cell of cells) {
    if (cell.isTransparent || visited.has(cell.index)) continue;

    const queue = [cell.index];
    let regionSize = 0;
    visited.add(cell.index);

    while (queue.length > 0) {
      const currentIndex = queue.shift();
      if (currentIndex === undefined) continue;
      const currentCell = cells[currentIndex];
      regionSize += 1;

      for (const neighborIndex of getNeighborIndices(currentIndex, width, height)) {
        if (visited.has(neighborIndex)) continue;
        const neighbor = cells[neighborIndex];
        if (neighbor.isTransparent || neighbor.matchedColorId !== currentCell.matchedColorId) continue;
        visited.add(neighborIndex);
        queue.push(neighborIndex);
      }
    }

    if (regionSize === 1) isolatedCellCount += 1;
    if (regionSize <= 3) smallBlockCount += 1;
  }

  return {
    isolatedCellCount,
    smallBlockCount,
  };
}
