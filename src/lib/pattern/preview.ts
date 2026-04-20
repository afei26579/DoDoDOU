import type { PatternResult } from '../../features/workshop/model/types';

function drawTransparentCellBackground(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
  const size = Math.max(6, Math.min(width, height) / 3);
  ctx.fillStyle = '#F3F1EC';
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = '#E4DFD6';
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
    if (cell.hex === 'transparent') {
      drawTransparentCellBackground(ctx, drawX, drawY, cellWidth, cellHeight);
    } else {
      ctx.fillStyle = cell.isExternal ? '#F5F2EC' : cell.hex;
      ctx.fillRect(drawX, drawY, cellWidth, cellHeight);
    }
    ctx.strokeStyle = 'rgba(93,83,74,0.18)';
    ctx.strokeRect(drawX, drawY, cellWidth, cellHeight);
  }
}
