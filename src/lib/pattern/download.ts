import type { ColorSystem, PatternResult } from '../../features/workshop/model/types';
import { getVendorCode } from './color-system';

type DownloadPatternOptions = {
  authorName: string;
  showGrid: boolean;
  gridGap: number;
  gridColor: string;
  showSymbol: boolean;
  showSymbolStats: boolean;
  addWatermark: boolean;
  brand: ColorSystem;
  patternResult: PatternResult;
};

type CanvasLike = HTMLCanvasElement | OffscreenCanvas;

type DrawMetrics = {
  x: number;
  y: number;
  w: number;
  h: number;
  cellSize: number;
};

function createCanvas(width: number, height: number, scale = 2): CanvasLike {
  const scaledWidth = Math.max(1, Math.floor(width * scale));
  const scaledHeight = Math.max(1, Math.floor(height * scale));
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(scaledWidth, scaledHeight);
  const canvas = document.createElement('canvas');
  canvas.width = scaledWidth;
  canvas.height = scaledHeight;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  return canvas;
}

function hexToRgb(hex: string) {
  const normalized = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function isLightColor(hex: string) {
  const rgb = hexToRgb(hex);
  if (!rgb) return true;
  const luminance = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
  return luminance >= 160;
}

function getTextColorForSwatch(hex: string) {
  return isLightColor(hex) ? '#2D2A2F' : '#FFFFFF';
}

function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  options?: { font?: string; color?: string; align?: CanvasTextAlign; baseline?: CanvasTextBaseline },
) {
  ctx.save();
  ctx.font = options?.font ?? '700 24px Nunito, sans-serif';
  ctx.fillStyle = options?.color ?? '#5D534A';
  ctx.textAlign = options?.align ?? 'left';
  ctx.textBaseline = options?.baseline ?? 'alphabetic';
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawTextOutlined(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  options?: { font?: string; color?: string; outlineColor?: string; outlineWidth?: number; align?: CanvasTextAlign; baseline?: CanvasTextBaseline },
) {
  ctx.save();
  ctx.font = options?.font ?? '700 24px Nunito, sans-serif';
  ctx.textAlign = options?.align ?? 'center';
  ctx.textBaseline = options?.baseline ?? 'middle';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = options?.outlineWidth ?? 3;
  ctx.strokeStyle = options?.outlineColor ?? 'rgba(255,255,255,0.85)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = options?.color ?? '#5D534A';
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function normalizeCellSymbol(vendorCode: string, cellSize: number) {
  const normalized = vendorCode.trim();
  if (!normalized) return '';
  if (cellSize <= 12) return normalized.slice(-1);
  if (cellSize <= 16) return normalized.slice(-2);
  if (cellSize <= 22) return normalized.slice(-3);
  return normalized;
}

function computeBoardMetrics(pattern: PatternResult, width: number, top: number) {
  const cellSize = 24;
  const boardW = cellSize * pattern.width;
  const boardH = cellSize * pattern.height;
  const x = Math.floor((width - boardW) / 2);
  return { x, y: top, w: boardW, h: boardH, cellSize };
}

function getContrastOutlineColor(fillColor: string) {
  return isLightColor(fillColor) ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.55)';
}

async function canvasToBlob(canvas: CanvasLike) {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type: 'image/png' });
  return new Promise<Blob>((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob((blob) => {
      if (!blob) reject(new Error('Failed to create image blob'));
      else resolve(blob);
    }, 'image/png');
  });
}

export async function downloadPatternImage(options: DownloadPatternOptions) {
  const { patternResult, authorName, showGrid, gridGap, gridColor, showSymbol, showSymbolStats, addWatermark, brand } = options;

  const boardCellSize = 24;
  const gridWidth = patternResult.width * boardCellSize;
  const gridHeight = patternResult.height * boardCellSize;
  const axisLabelSize = Math.max(28, Math.round(boardCellSize * 1.2));
  const extraLeftMargin = Math.max(24, Math.round(boardCellSize * 0.9));
  const extraRightMargin = Math.max(24, Math.round(boardCellSize * 0.9));
  const extraTopMargin = Math.max(20, Math.round(boardCellSize * 0.8));
  const extraBottomMargin = Math.max(20, Math.round(boardCellSize * 0.8));
  const xiaohongshuAreaHeight = Math.max(34, Math.round(boardCellSize * 1.4));

  const paddingX = 72;
  const headerTop = 56;
  const titleBarHeight = 80;
  const boardTop = titleBarHeight + extraTopMargin + axisLabelSize;
  const paletteTopGap = 24;

  const paletteColumns = 8;
  const paletteRows = Math.max(1, Math.ceil(patternResult.palette.length / paletteColumns));
  const paletteItemWidth = 152;
  const paletteItemHeight = 82;
  const statsHeight = 72 + paletteRows * (paletteItemHeight + 14) + 40;
  const boardWidth = gridWidth + axisLabelSize * 2 + extraLeftMargin + extraRightMargin;
  const canvasHeight = titleBarHeight + gridHeight + axisLabelSize * 2 + statsHeight + extraTopMargin + extraBottomMargin + xiaohongshuAreaHeight;
  const width = boardWidth + paddingX * 2;

  const exportScale = 2;
  const canvas = createCanvas(width, canvasHeight, exportScale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.scale(exportScale, exportScale);
  ctx.imageSmoothingEnabled = false;

  ctx.fillStyle = '#FFFDFB';
  ctx.fillRect(0, 0, width, canvasHeight);

  const normalizedAuthorName = authorName.trim();
  if (normalizedAuthorName) {
    drawText(ctx, normalizedAuthorName, paddingX, headerTop, {
      font: '800 34px Nunito, sans-serif',
      color: '#6A4E69',
    });
  }

  const board = computeBoardMetrics(patternResult, width - paddingX * 2, boardTop);
  board.x += paddingX;

  ctx.save();
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(board.x, board.y, board.w, board.h);
  ctx.restore();

  const cellSize = board.cellSize;
  const gridEvery = Math.max(1, Math.round(gridGap));
  const dividerColor = gridColor || '#B6B6B6';
  const minorLineColor = 'rgba(93,83,74,0.22)';
  const majorLineColor = dividerColor;

  for (const cell of patternResult.cells) {
    const x = board.x + cell.x * cellSize;
    const y = board.y + cell.y * cellSize;
    const swatchHex = cell.hex === 'transparent' ? '#F3F1EC' : cell.hex;

    ctx.fillStyle = swatchHex;
    ctx.fillRect(x, y, cellSize, cellSize);

    if (showSymbol) {
      const symbol = normalizeCellSymbol(cell.vendorCode, cellSize);
      const symbolFontSize = Math.max(9, Math.min(13, Math.floor(cellSize * 0.32)));
      ctx.save();
      ctx.font = `800 ${symbolFontSize}px Nunito, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(2.2, Math.ceil(symbolFontSize * 0.26));
      const fillColor = getTextColorForSwatch(swatchHex);
      const outlineColor = getContrastOutlineColor(swatchHex);
      ctx.strokeStyle = outlineColor;
      ctx.fillStyle = fillColor;
      ctx.strokeText(symbol, x + cellSize / 2, y + cellSize / 2);
      ctx.fillText(symbol, x + cellSize / 2, y + cellSize / 2);
      ctx.restore();
    }
  }

  const drawGridPass = (strokeStyle: string, lineWidth: number, alpha = 1) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.beginPath();

    for (let i = 0; i <= patternResult.width; i++) {
      const x = board.x + i * cellSize + 0.5;
      ctx.moveTo(x, board.y);
      ctx.lineTo(x, board.y + board.h);
    }

    for (let j = 0; j <= patternResult.height; j++) {
      const y = board.y + j * cellSize + 0.5;
      ctx.moveTo(board.x, y);
      ctx.lineTo(board.x + board.w, y);
    }

    ctx.stroke();
    ctx.restore();
  };

  // Base grid is always visible.
  drawGridPass('rgba(255,255,255,0.18)', 1.8, 0.55);
  drawGridPass('rgba(93,83,74,0.06)', 0.9, 0.95);

  if (showGrid) {
    const drawMajorLine = (x1: number, y1: number, x2: number, y2: number) => {
      const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
      gradient.addColorStop(0, 'rgba(255,255,255,0.18)');
      gradient.addColorStop(0.45, majorLineColor);
      gradient.addColorStop(0.65, 'rgba(93,83,74,0.24)');
      gradient.addColorStop(1, 'rgba(255,255,255,0.12)');
      ctx.save();
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 2.1;
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.restore();
    };

    for (let i = 0; i <= patternResult.width; i += gridEvery) {
      const x = board.x + i * cellSize + 0.5;
      drawMajorLine(x, board.y, x, board.y + board.h);
    }

    for (let j = 0; j <= patternResult.height; j += gridEvery) {
      const y = board.y + j * cellSize + 0.5;
      drawMajorLine(board.x, y, board.x + board.w, y);
    }
  }

  ctx.save();
  ctx.strokeStyle = 'rgba(93,83,74,0.08)';
  ctx.lineWidth = 1;
  ctx.strokeRect(board.x + 0.5, board.y + 0.5, board.w - 1, board.h - 1);
  ctx.restore();

  const statsY = board.y + board.h + 44;
  drawText(ctx, '物料清单', paddingX, statsY, {
    font: '800 28px Nunito, sans-serif',
    color: '#5D534A',
  });
  drawText(ctx, `${patternResult.stats.colorCount} 色  ${patternResult.stats.totalCells} 颗`, width - paddingX, statsY, {
    font: '800 20px Nunito, sans-serif',
    color: '#7D6B74',
    align: 'right',
  });

  let paletteY = statsY + paletteTopGap;
  patternResult.palette.forEach((entry, index) => {
    const row = Math.floor(index / paletteColumns);
    const col = index % paletteColumns;
    const x = paddingX + col * (paletteItemWidth + 12);
    const y = paletteY + row * (paletteItemHeight + 14);
    const swatchColor = entry.hex === 'transparent' ? '#F3F1EC' : entry.hex;
    const textColor = getTextColorForSwatch(swatchColor);

    drawRoundRect(ctx, x, y, paletteItemWidth, paletteItemHeight, 18);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.strokeStyle = 'rgba(93,83,74,0.06)';
    ctx.stroke();

    drawRoundRect(ctx, x + 10, y + 10, paletteItemWidth - 20, 36, 12);
    ctx.fillStyle = swatchColor;
    ctx.fill();

    drawText(ctx, getVendorCode(entry.hex, brand), x + paletteItemWidth / 2, y + 32, {
      font: '800 16px Nunito, sans-serif',
      color: textColor,
      align: 'center',
      baseline: 'middle',
    });
    drawText(ctx, `${entry.count}`, x + paletteItemWidth / 2, y + 62, {
      font: '700 14px Nunito, sans-serif',
      color: '#5D534A',
      align: 'center',
      baseline: 'middle',
    });
  });

  if (showSymbolStats) {
    // Keep the toggle influential without changing the requested layout.
    // When disabled, we simply omit the list entirely.
  }

  if (!showSymbolStats) {
    ctx.clearRect(0, statsY + 8, width, canvasHeight - (statsY + 8));
    drawText(ctx, '物料清单已关闭', paddingX, statsY + 26, {
      font: '700 16px Nunito, sans-serif',
      color: 'rgba(93,83,74,0.62)',
    });
  }

  if (addWatermark) {
    const watermarkText = normalizedAuthorName;
    ctx.save();
    ctx.globalAlpha = 0.11;
    ctx.fillStyle = '#C593D4';
    ctx.font = '800 18px Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.translate(width / 2, canvasHeight / 2);
    ctx.rotate(-Math.PI / 6);
    if (watermarkText) {
      for (let y = -canvasHeight; y < canvasHeight * 1.5; y += 96) {
        for (let x = -width; x < width * 1.5; x += 220) {
          ctx.fillText(watermarkText, x, y);
        }
      }
    }
    ctx.restore();
  }

  const blob = await canvasToBlob(canvas);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${authorName.trim() || 'dodoudou'}-图纸.png`;
  link.click();
  URL.revokeObjectURL(url);
}
