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

function parseHexColor(hex: string) {
  const normalized = hex.startsWith('#') ? hex.slice(1) : hex;
  if (normalized.length !== 6) return null;
  const value = Number.parseInt(normalized, 16);
  if (Number.isNaN(value)) return null;
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

function getPerceivedBrightness(hex: string) {
  const rgb = parseHexColor(hex);
  if (!rgb) return 255;
  return rgb.r * 0.299 + rgb.g * 0.587 + rgb.b * 0.114;
}

function getAccentStrokeStyle(hex: string) {
  return getPerceivedBrightness(hex) >= 150 ? 'rgba(34, 34, 34, 0.92)' : 'rgba(255, 255, 255, 0.92)';
}

function getAccentShadowColor(hex: string) {
  return getPerceivedBrightness(hex) >= 150 ? 'rgba(0, 0, 0, 0.28)' : 'rgba(255, 255, 255, 0.34)';
}

export function drawPatternPreview(params: {
  canvas: HTMLCanvasElement;
  pattern: PatternResult;
  activeColorKey?: string | null;
  activeBlockCellKeys?: string[];
  completedCellKeys?: string[];
  activeOpacity?: number;
  completedOverlayColor?: string;
  separator?: {
    visible: boolean;
    interval: number;
    color: string;
  };
}) {
  const { canvas, pattern, activeColorKey = null, activeBlockCellKeys = [], completedCellKeys = [], activeOpacity = 1, completedOverlayColor = '#86EFAC', separator } = params;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const cellWidth = canvas.width / pattern.width;
  const cellHeight = canvas.height / pattern.height;
  const hasActiveColor = Boolean(activeColorKey);
  const activeBlockCellKeySet = new Set(activeBlockCellKeys);
  const completedCellKeySet = new Set(completedCellKeys);
  const separatorVisible = separator?.visible ?? false;
  const separatorInterval = Math.max(1, Math.floor(separator?.interval ?? 1));
  const separatorColor = separator?.color ?? 'rgba(93,83,74,0.2)';

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.lineWidth = 0.6;

  for (const cell of pattern.cells) {
    const drawX = cell.x * cellWidth;
    const drawY = cell.y * cellHeight;
    const cellKey = `${cell.colorId}-${cell.vendorCode}-${cell.hex}`;
    const isActiveColor = hasActiveColor ? cellKey === activeColorKey : true;
    const cellCoordinateKey = `${cell.x},${cell.y}`;
    const isActiveCell = activeBlockCellKeySet.has(cellCoordinateKey) && isActiveColor;
    const isCompletedCell = completedCellKeySet.has(cellCoordinateKey);
    const alpha = hasActiveColor ? (isActiveColor ? activeOpacity : 0.1) : 1;

    ctx.save();
    ctx.globalAlpha = alpha;

    if (cell.hex === 'transparent' || cell.isExternal) {
      drawTransparentCellBackground(ctx, drawX, drawY, cellWidth, cellHeight);
    } else {
      ctx.fillStyle = cell.hex;
      ctx.fillRect(drawX, drawY, cellWidth, cellHeight);
    }

    if (isCompletedCell && isActiveColor && !(cell.hex === 'transparent' || cell.isExternal)) {
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.fillStyle = completedOverlayColor;
      ctx.fillRect(drawX, drawY, cellWidth, cellHeight);
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(drawX, drawY, cellWidth, cellHeight);
      ctx.restore();
    }

    ctx.strokeStyle = isActiveColor ? 'rgba(93,83,74,0.3)' : 'rgba(93,83,74,0.12)';
    ctx.strokeRect(drawX, drawY, cellWidth, cellHeight);

    if (separatorVisible) {
      const isSeparatorX = cell.x > 0 && cell.x % separatorInterval === 0;
      const isSeparatorY = cell.y > 0 && cell.y % separatorInterval === 0;
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = separatorColor;
      ctx.lineWidth = Math.max(1.8, Math.min(cellWidth, cellHeight) * 0.2);
      if (isSeparatorX) {
        const x = drawX;
        ctx.beginPath();
        ctx.moveTo(x, drawY);
        ctx.lineTo(x, drawY + cellHeight);
        ctx.stroke();
      }
      if (isSeparatorY) {
        const y = drawY;
        ctx.beginPath();
        ctx.moveTo(drawX, y);
        ctx.lineTo(drawX + cellWidth, y);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (isActiveCell && hasActiveColor) {
      const inset = Math.max(0.5, Math.min(cellWidth, cellHeight) * 0.08);
      ctx.shadowColor = getAccentShadowColor(cell.hex);
      ctx.shadowBlur = Math.max(2, Math.min(cellWidth, cellHeight) * 0.18);
      ctx.lineWidth = Math.max(1.2, Math.min(cellWidth, cellHeight) * 0.12);
      ctx.strokeStyle = getAccentStrokeStyle(cell.hex);
      ctx.strokeRect(drawX + inset, drawY + inset, cellWidth - inset * 2, cellHeight - inset * 2);
    }

    ctx.restore();
  }
}
