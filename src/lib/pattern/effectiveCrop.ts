import type { PatternCell, PatternResult } from '../../features/workshop/model/types';

const TRANSPARENT_KEY = '__TRANSPARENT__';

export type EffectivePatternBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
};

function isVisibleCell(cell: PatternCell | undefined) {
  return Boolean(cell && !cell.isExternal && cell.hex && cell.hex !== 'transparent');
}

function createTransparentCell(x: number, y: number): PatternCell {
  return {
    x,
    y,
    colorId: TRANSPARENT_KEY,
    vendorCode: '',
    hex: 'transparent',
    isExternal: true,
  };
}

function rebuildPalette(cells: PatternCell[]) {
  const paletteCounts = new Map<string, { colorId: string; vendorCode: string; hex: string; count: number }>();

  for (const cell of cells) {
    if (!isVisibleCell(cell)) continue;
    const key = cell.hex.toUpperCase();
    const current = paletteCounts.get(key);
    if (current) {
      current.count += 1;
    } else {
      paletteCounts.set(key, {
        colorId: cell.colorId,
        vendorCode: cell.vendorCode,
        hex: key,
        count: 1,
      });
    }
  }

  return [...paletteCounts.values()].sort((a, b) => b.count - a.count);
}

export function getEffectivePatternBounds(pattern: PatternResult): EffectivePatternBounds | null {
  const visibleCells = pattern.cells.filter(isVisibleCell);
  if (visibleCells.length === 0) return null;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const cell of visibleCells) {
    minX = Math.min(minX, cell.x);
    minY = Math.min(minY, cell.y);
    maxX = Math.max(maxX, cell.x);
    maxY = Math.max(maxY, cell.y);
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

export function cropPatternToEffectiveBounds(pattern: PatternResult) {
  const bounds = getEffectivePatternBounds(pattern);
  if (!bounds) return null;

  const isAlreadyCropped =
    bounds.minX === 0 &&
    bounds.minY === 0 &&
    bounds.width === pattern.width &&
    bounds.height === pattern.height;

  if (isAlreadyCropped) {
    return {
      bounds,
      newPatternResult: pattern,
      cropped: false,
    };
  }

  const cellsByCoordinate = new Map(pattern.cells.map((cell) => [`${cell.x},${cell.y}`, cell] as const));
  const nextCells: PatternCell[] = [];

  for (let y = 0; y < bounds.height; y += 1) {
    for (let x = 0; x < bounds.width; x += 1) {
      const sourceCell = cellsByCoordinate.get(`${x + bounds.minX},${y + bounds.minY}`);
      if (!sourceCell || !isVisibleCell(sourceCell)) {
        nextCells.push(createTransparentCell(x, y));
        continue;
      }

      nextCells.push({
        ...sourceCell,
        x,
        y,
      });
    }
  }

  const palette = rebuildPalette(nextCells);

  return {
    bounds,
    cropped: true,
    newPatternResult: {
      width: bounds.width,
      height: bounds.height,
      cells: nextCells,
      palette,
      stats: {
        totalCells: nextCells.filter(isVisibleCell).length,
        colorCount: palette.length,
      },
    } satisfies PatternResult,
  };
}
