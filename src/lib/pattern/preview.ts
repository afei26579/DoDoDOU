import type { PatternResult } from '../../features/workshop/model/types';

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
    ctx.fillStyle = cell.isExternal ? '#F5F2EC' : cell.hex;
    ctx.fillRect(drawX, drawY, cellWidth, cellHeight);
    ctx.strokeStyle = 'rgba(93,83,74,0.18)';
    ctx.strokeRect(drawX, drawY, cellWidth, cellHeight);
  }
}
