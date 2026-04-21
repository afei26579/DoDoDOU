import type { PatternResult } from '../../features/workshop/model/types';

const TRANSPARENT_BASE_COLOR = '#F3F1EC';
const TRANSPARENT_CHECKER_COLOR = '#E4DFD6';

function drawTransparentCellBackground(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
  const size = Math.max(6, Math.min(width, height) / 3);
  ctx.fillStyle = TRANSPARENT_BASE_COLOR;
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = TRANSPARENT_CHECKER_COLOR;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      if ((row + col) % 2 === 0) continue;
      ctx.fillRect(x + col * size, y + row * size, size, size);
    }
  }
}

export function drawPatternPreview(params: {
  canvas: HTMLCanvasElement;
  pattern: PatternResult;
}) {
  const { canvas, pattern } = params;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const cellWidth = canvas.width / pattern.width;
  const cellHeight = canvas.height / pattern.height;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.lineWidth = 0.6;

  for (const cell of pattern.cells) {
    const drawX = cell.x * cellWidth;
    const drawY = cell.y * cellHeight;
    if (cell.hex === 'transparent' || cell.isExternal) {
      drawTransparentCellBackground(ctx, drawX, drawY, cellWidth, cellHeight);
    } else {
      ctx.fillStyle = cell.hex;
      ctx.fillRect(drawX, drawY, cellWidth, cellHeight);
    }
    ctx.strokeStyle = 'rgba(93,83,74,0.18)';
    ctx.strokeRect(drawX, drawY, cellWidth, cellHeight);
  }
}
