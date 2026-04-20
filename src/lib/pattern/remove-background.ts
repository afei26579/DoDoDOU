import type { PatternCell, PatternResult } from '../../features/workshop/model/types';

export type MappedPixel = PatternCell;

export type GridDimensions = {
  N: number;
  M: number;
};

const TRANSPARENT_KEY = '__TRANSPARENT__';

function cloneCell(cell: PatternCell): PatternCell {
  return { ...cell };
}

function createTransparentCell(cell: PatternCell | undefined, x: number, y: number): PatternCell {
  return {
    x,
    y,
    colorId: TRANSPARENT_KEY,
    vendorCode: '',
    hex: 'transparent',
    isExternal: cell?.isExternal,
  };
}

function rebuildPatternResult(cells: PatternCell[][]): PatternResult {
  const paletteCounts = new Map<string, { colorId: string; vendorCode: string; hex: string; count: number }>();
  let totalCells = 0;

  for (const row of cells) {
    for (const cell of row) {
      if (cell.colorId === TRANSPARENT_KEY || cell.hex === 'transparent') continue;
      totalCells += 1;
      const existing = paletteCounts.get(cell.hex.toUpperCase());
      if (existing) {
        existing.count += 1;
      } else {
        paletteCounts.set(cell.hex.toUpperCase(), {
          colorId: cell.colorId,
          vendorCode: cell.vendorCode,
          hex: cell.hex.toUpperCase(),
          count: 1,
        });
      }
    }
  }

  return {
    width: cells[0]?.length ?? 0,
    height: cells.length,
    cells: cells.flat(),
    palette: [...paletteCounts.values()],
    stats: {
      totalCells,
      colorCount: paletteCounts.size,
    },
  };
}

export function removePatternBackground(pattern: PatternResult) {
  const gridDimensions: GridDimensions = {
    N: pattern.width,
    M: pattern.height,
  };

  const mappedPixelData: MappedPixel[][] = Array.from({ length: gridDimensions.M }, (_, row) =>
    Array.from({ length: gridDimensions.N }, (_, col) => cloneCell(pattern.cells[row * gridDimensions.N + col])),
  );

  const borderCounts = new Map<string, number>();
  const countBorderCell = (row: number, col: number) => {
    const cell = mappedPixelData[row]?.[col];
    if (!cell || cell.isExternal || cell.colorId === TRANSPARENT_KEY) return;
    borderCounts.set(cell.colorId, (borderCounts.get(cell.colorId) || 0) + 1);
  };

  for (let col = 0; col < gridDimensions.N; col++) {
    countBorderCell(0, col);
    if (gridDimensions.M > 1) countBorderCell(gridDimensions.M - 1, col);
  }
  for (let row = 1; row < gridDimensions.M - 1; row++) {
    countBorderCell(row, 0);
    if (gridDimensions.N > 1) countBorderCell(row, gridDimensions.N - 1);
  }

  if (borderCounts.size === 0) return null;

  let targetKey = '';
  let maxCount = -1;
  borderCounts.forEach((count, key) => {
    if (count > maxCount) {
      maxCount = count;
      targetKey = key;
    }
  });

  const newPixelData = mappedPixelData.map((row) => row.map((cell) => ({ ...cell })));
  const visited = Array.from({ length: gridDimensions.M }, () => Array(gridDimensions.N).fill(false));
  const stack: { row: number; col: number }[] = [];

  const pushIfTarget = (row: number, col: number) => {
    if (row < 0 || row >= gridDimensions.M || col < 0 || col >= gridDimensions.N || visited[row][col]) return;
    const cell = newPixelData[row][col];
    if (!cell || cell.isExternal || cell.colorId !== targetKey) return;
    visited[row][col] = true;
    stack.push({ row, col });
  };

  for (let col = 0; col < gridDimensions.N; col++) {
    pushIfTarget(0, col);
    if (gridDimensions.M > 1) pushIfTarget(gridDimensions.M - 1, col);
  }
  for (let row = 1; row < gridDimensions.M - 1; row++) {
    pushIfTarget(row, 0);
    if (gridDimensions.N > 1) pushIfTarget(row, gridDimensions.N - 1);
  }

  if (stack.length === 0) return null;

  while (stack.length > 0) {
    const { row, col } = stack.pop()!;
    newPixelData[row][col] = createTransparentCell(newPixelData[row][col], col, row);
    pushIfTarget(row - 1, col);
    pushIfTarget(row + 1, col);
    pushIfTarget(row, col - 1);
    pushIfTarget(row, col + 1);
  }

  return {
    newPixelData,
    newPatternResult: rebuildPatternResult(newPixelData),
  };
}
