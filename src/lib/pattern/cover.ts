import type { PatternResult } from '../../features/workshop/model/types';

const MAX_COVER_SIDE = 960;
const MIN_CELL_SIZE = 4;

export type PatternCoverImage = {
  dataUrl: string;
  width: number;
  height: number;
};

export function generatePatternCover(pattern: PatternResult): PatternCoverImage {
  const longestSide = Math.max(pattern.width, pattern.height, 1);
  const cellSize = Math.max(MIN_CELL_SIZE, Math.floor(MAX_COVER_SIDE / longestSide));
  const width = Math.max(1, pattern.width * cellSize);
  const height = Math.max(1, pattern.height * cellSize);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { dataUrl: '', width, height };
  }

  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, width, height);

  for (const cell of pattern.cells) {
    if (cell.hex === 'transparent' || cell.isExternal) {
      continue;
    }

    ctx.fillStyle = cell.hex;
    ctx.fillRect(cell.x * cellSize, cell.y * cellSize, cellSize, cellSize);
  }

  return {
    dataUrl: canvas.toDataURL('image/png'),
    width,
    height,
  };
}
