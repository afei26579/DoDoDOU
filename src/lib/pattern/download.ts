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

type LayoutMetrics = {
  gridSize: number;
  rawLeftMargin: number;
  rawRightMargin: number;
  rawTopMargin: number;
  rawGridBottomMargin: number;
  rawBottomMargin: number;
  leftMargin: number;
  rightMargin: number;
  topMargin: number;
  gridBottomMargin: number;
  bottomMargin: number;
  rulerSize: number;
  headerPaddingY: number;
  authorFontSize: number;
  titleFontSize: number;
  subtitleFontSize: number;
  cellSymbolFontSize: number;
  rawPaletteCardWidth: number;
  rawPaletteCardHeight: number;
  paletteCardWidth: number;
  paletteCardHeight: number;
  paletteTextFontSize: number;
  paletteCountFontSize: number;
  paletteGap: number;
  paletteRowGap: number;
  paletteColumns: number;
  statsTitleGap: number;
  statsSummaryGap: number;
  statsSectionGap: number;
  statsTitleHeight: number;
  statsSummaryHeight: number;
  paletteBlockTopGap: number;
};

type RulerSpec = {
  topLabels: number[];
  leftLabels: number[];
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

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

function computeLayout(pattern: PatternResult) {
  const gridSize = pattern.width * 30;
  const rawLeftMargin = gridSize / 40;
  const rawRightMargin = rawLeftMargin;
  const rawTopMargin = gridSize / 20;
  const rawGridBottomMargin = gridSize / 40;
  const rawBottomMargin = gridSize / 10;
  const rawRulerSize = gridSize / 20;
  const rawHeaderPaddingY = gridSize / 40;
  const rawAuthorFontSize = gridSize / 20;
  const rawTitleFontSize = gridSize / 20;
  const rawSubtitleFontSize = gridSize / 40;
  const rawPaletteCardWidth = gridSize / 10;
  const rawPaletteCardHeight = gridSize / 20;
  const leftMargin = Math.max(8, rawLeftMargin);
  const rightMargin = Math.max(8, rawRightMargin);
  const topMargin = Math.max(16, rawTopMargin);
  const gridBottomMargin = Math.max(8, rawGridBottomMargin);
  const bottomMargin = Math.max(20, rawBottomMargin);
  const rulerSize = Math.max(18, rawRulerSize);
  const headerPaddingY = Math.max(8, rawHeaderPaddingY);
  const authorFontSize = Math.max(16, rawAuthorFontSize);
  const titleFontSize = Math.max(16, rawTitleFontSize);
  const subtitleFontSize = Math.max(10, rawSubtitleFontSize);
  const cellSymbolFontSize = clamp(30 * 0.42, 10, 18);
  const paletteCardWidth = Math.max(48, rawPaletteCardWidth);
  const paletteCardHeight = Math.max(30, rawPaletteCardHeight);
  const paletteTextFontSize = Math.max(9, paletteCardHeight * 0.46);
  const paletteCountFontSize = Math.max(8, paletteCardHeight * 0.34);
  const paletteGap = Math.max(8, gridSize / 80);
  const paletteRowGap = paletteGap;
  const paletteColumns = 8;
  const statsTitleGap = Math.max(10, gridSize / 40);
  const statsSummaryGap = Math.max(8, gridSize / 60);
  const statsSectionGap = Math.max(14, gridSize / 30);
  const statsTitleHeight = Math.max(18, gridSize / 40);
  const statsSummaryHeight = Math.max(16, gridSize / 50);
  const paletteBlockTopGap = Math.max(10, gridSize / 40);

  return {
    gridSize,
    rawLeftMargin,
    rawRightMargin,
    rawTopMargin,
    rawGridBottomMargin,
    rawBottomMargin,
    leftMargin,
    rightMargin,
    topMargin,
    gridBottomMargin,
    bottomMargin,
    rulerSize,
    headerPaddingY,
    authorFontSize,
    titleFontSize,
    subtitleFontSize,
    cellSymbolFontSize,
    rawPaletteCardWidth,
    rawPaletteCardHeight,
    paletteCardWidth,
    paletteCardHeight,
    paletteTextFontSize,
    paletteCountFontSize,
    paletteGap,
    paletteRowGap,
    paletteColumns,
    statsTitleGap,
    statsSummaryGap,
    statsSectionGap,
    statsTitleHeight,
    statsSummaryHeight,
    paletteBlockTopGap,
  } satisfies LayoutMetrics;
}

function computeRulerSpec(pattern: PatternResult): RulerSpec {
  const majorStep = pattern.width >= 24 ? 10 : 5;
  const topLabels: number[] = [];
  const leftLabels: number[] = [];

  for (let i = 1; i <= pattern.width; i++) {
    if (i === 1 || i === pattern.width || i % majorStep === 0) topLabels.push(i);
  }
  for (let i = 1; i <= pattern.height; i++) {
    if (i === 1 || i === pattern.height || i % majorStep === 0) leftLabels.push(i);
  }

  return { topLabels, leftLabels };
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

  const log = (...args: unknown[]) => {
    console.log('[downloadPatternImage]', ...args);
  };

  const layout = computeLayout(patternResult);
  const rulerSpec = computeRulerSpec(patternResult);
  log('网格尺寸', { width: patternResult.width, height: patternResult.height, cellSize: 30, gridWidth: patternResult.width * 30, gridHeight: patternResult.height * 30 });
  log('布局参数', {
    canvasWidth: layout.leftMargin + layout.rulerSize + patternResult.width * 30 + layout.rulerSize + layout.rightMargin,
    leftMargin: layout.leftMargin,
    rightMargin: layout.rightMargin,
    topMargin: layout.topMargin,
    gridBottomMargin: layout.gridBottomMargin,
    bottomMargin: layout.bottomMargin,
    authorFontSize: layout.authorFontSize,
    titleFontSize: layout.titleFontSize,
    subtitleFontSize: layout.subtitleFontSize,
    cellSymbolFontSize: layout.cellSymbolFontSize,
    paletteCardWidth: layout.paletteCardWidth,
    paletteCardHeight: layout.paletteCardHeight,
    paletteTextFontSize: layout.paletteTextFontSize,
    paletteCountFontSize: layout.paletteCountFontSize,
    rulerSize: layout.rulerSize,
  });
  const cellSize = 30;
  const gridWidth = patternResult.width * cellSize;
  const gridHeight = patternResult.height * cellSize;
  const leftRulerWidth = layout.rulerSize;
  const topRulerHeight = layout.rulerSize;
  const boardX = layout.leftMargin + leftRulerWidth;
  const boardY = layout.topMargin + topRulerHeight;
  const boardWidth = gridWidth;
  const boardHeight = gridHeight;
  const canvasWidth = layout.leftMargin + leftRulerWidth + gridWidth + leftRulerWidth + layout.rightMargin;
  log('画布尺寸', { width: canvasWidth, height: 0 });

  const paletteCardRows = Math.max(1, Math.ceil(patternResult.palette.length / layout.paletteColumns));
  const paletteAreaHeight = paletteCardRows * layout.paletteCardHeight + Math.max(0, paletteCardRows - 1) * layout.paletteRowGap;

  const authorAreaHeight = layout.authorFontSize + layout.headerPaddingY * 2;
  const statsTitleBlockHeight = layout.statsTitleHeight + layout.statsSummaryHeight + layout.statsSummaryGap;
  const statsBlockHeight = statsTitleBlockHeight + layout.statsSectionGap;
  const canvasHeight =
    layout.topMargin +
    authorAreaHeight +
    layout.gridBottomMargin +
    boardHeight +
    layout.topMargin +
    statsBlockHeight +
    paletteAreaHeight +
    layout.bottomMargin +
    layout.paletteBlockTopGap;
  log('画布尺寸', { width: canvasWidth, height: canvasHeight });

  const exportScale = 2;
  const canvas = createCanvas(canvasWidth, canvasHeight, exportScale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.scale(exportScale, exportScale);
  ctx.imageSmoothingEnabled = false;

  ctx.fillStyle = '#FFFDFB';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  const normalizedAuthorName = authorName.trim();
  const authorBaselineY = layout.topMargin + layout.headerPaddingY + layout.authorFontSize;
  if (normalizedAuthorName) {
    drawText(ctx, normalizedAuthorName, layout.leftMargin, authorBaselineY, {
      font: `800 ${layout.authorFontSize}px Nunito, sans-serif`,
      color: '#6A4E69',
    });
  } else {
    log('作者署名为空，未绘制');
  }

  // Background blocks for ruler and board.
  ctx.save();
  ctx.fillStyle = '#F6F1E8';
  ctx.fillRect(boardX - layout.rulerSize, boardY, layout.rulerSize, boardHeight);
  ctx.fillRect(boardX, boardY - layout.rulerSize, boardWidth, layout.rulerSize);
  ctx.restore();

  // Board surface.
  ctx.save();
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(boardX, boardY, boardWidth, boardHeight);
  ctx.restore();

  const gridEvery = Math.max(1, Math.round(gridGap));
  const dividerColor = gridColor || '#B6B6B6';
  const majorLineColor = dividerColor;

  for (const cell of patternResult.cells) {
    const x = boardX + cell.x * cellSize;
    const y = boardY + cell.y * cellSize;
    const swatchHex = cell.hex === 'transparent' ? '#F3F1EC' : cell.hex;

    ctx.fillStyle = swatchHex;
    ctx.fillRect(x, y, cellSize, cellSize);

    if (showSymbol) {
      const symbol = normalizeCellSymbol(cell.vendorCode, cellSize);
      ctx.save();
      ctx.font = `800 ${layout.cellSymbolFontSize}px Nunito, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(1.6, Math.ceil(layout.cellSymbolFontSize * 0.18));
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
      const x = boardX + i * cellSize + 0.5;
      ctx.moveTo(x, boardY);
      ctx.lineTo(x, boardY + boardHeight);
    }

    for (let j = 0; j <= patternResult.height; j++) {
      const y = boardY + j * cellSize + 0.5;
      ctx.moveTo(boardX, y);
      ctx.lineTo(boardX + boardWidth, y);
    }

    ctx.stroke();
    ctx.restore();
  };

  drawGridPass('rgba(255,255,255,0.16)', 1.6, 0.55);
  drawGridPass('rgba(93,83,74,0.08)', 0.8, 0.95);

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

    for (let i = 0; i <= patternResult.width; i += gridGap) {
      const x = boardX + i * cellSize + 0.5;
      drawMajorLine(x, boardY, x, boardY + boardHeight);
    }

    for (let j = 0; j <= patternResult.height; j += gridGap) {
      const y = boardY + j * cellSize + 0.5;
      drawMajorLine(boardX, y, boardX + boardWidth, y);
    }
  }

  // Outer border.
  ctx.save();
  ctx.strokeStyle = 'rgba(93,83,74,0.1)';
  ctx.lineWidth = 1;
  ctx.strokeRect(boardX + 0.5, boardY + 0.5, boardWidth - 1, boardHeight - 1);
  ctx.restore();

  // Coordinate rulers.
  ctx.save();
  ctx.fillStyle = '#E7DDD0';
  ctx.fillRect(boardX, boardY - layout.rulerSize, boardWidth, layout.rulerSize);
  ctx.fillRect(boardX - layout.rulerSize, boardY, layout.rulerSize, boardHeight);
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = 'rgba(93,83,74,0.08)';
  ctx.lineWidth = 1;
  ctx.strokeRect(boardX - layout.rulerSize + 0.5, boardY + 0.5, layout.rulerSize - 1, boardHeight - 1);
  ctx.strokeRect(boardX + 0.5, boardY - layout.rulerSize + 0.5, boardWidth - 1, layout.rulerSize - 1);
  ctx.restore();

  rulerSpec.topLabels.forEach((label) => {
    const x = boardX + (label - 0.5) * cellSize;
    drawText(ctx, `${label}`, x, boardY - layout.rulerSize * 0.28, {
      font: `700 ${clamp(layout.subtitleFontSize, 10, 18)}px Nunito, sans-serif`,
      color: '#9A8E84',
      align: 'center',
      baseline: 'middle',
    });
  });

  rulerSpec.leftLabels.forEach((label) => {
    const y = boardY + (label - 0.5) * cellSize;
    drawText(ctx, `${label}`, boardX - layout.rulerSize * 0.32, y, {
      font: `700 ${clamp(layout.subtitleFontSize, 10, 18)}px Nunito, sans-serif`,
      color: '#9A8E84',
      align: 'center',
      baseline: 'middle',
    });
  });

  const statsTitleY = boardY + boardHeight + layout.gridBottomMargin + layout.statsTitleHeight;
  drawText(ctx, '物料清单', layout.leftMargin, statsTitleY, {
    font: `800 ${layout.titleFontSize}px Nunito, sans-serif`,
    color: '#5D534A',
  });
  drawText(ctx, `${patternResult.stats.colorCount} 色  ${patternResult.stats.totalCells} 颗`, canvasWidth - layout.rightMargin, statsTitleY, {
    font: `800 ${layout.subtitleFontSize}px Nunito, sans-serif`,
    color: '#7D6B74',
    align: 'right',
  });

  const paletteStartY = statsTitleY + layout.statsSummaryGap + layout.statsSectionGap;
  log('色块布局', {
    cardWidth: layout.paletteCardWidth,
    cardHeight: layout.paletteCardHeight,
    textFontSize: layout.paletteTextFontSize,
    countFontSize: layout.paletteCountFontSize,
    rows: paletteCardRows,
    columns: layout.paletteColumns,
  });
  patternResult.palette.forEach((entry, index) => {
    const row = Math.floor(index / layout.paletteColumns);
    const col = index % layout.paletteColumns;
    const x = layout.leftMargin + col * (layout.paletteCardWidth + layout.paletteGap);
    const y = paletteStartY + row * (layout.paletteCardHeight + layout.paletteRowGap);
    const swatchColor = entry.hex === 'transparent' ? '#F3F1EC' : entry.hex;
    const textColor = getTextColorForSwatch(swatchColor);

    drawRoundRect(ctx, x, y, layout.paletteCardWidth, layout.paletteCardHeight, clamp(cellSize * 0.12, 4, 10));
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.strokeStyle = 'rgba(93,83,74,0.06)';
    ctx.stroke();

    const swatchInset = clamp(layout.paletteCardHeight * 0.16, 4, 10);
    const swatchHeight = clamp(layout.paletteCardHeight * 0.36, 10, 24);
    drawRoundRect(ctx, x + swatchInset, y + swatchInset, layout.paletteCardWidth - swatchInset * 2, swatchHeight, clamp(cellSize * 0.08, 3, 8));
    ctx.fillStyle = swatchColor;
    ctx.fill();

    drawText(ctx, getVendorCode(entry.hex, brand), x + layout.paletteCardWidth / 2, y + swatchInset + swatchHeight / 2, {
      font: `800 ${layout.paletteTextFontSize}px Nunito, sans-serif`,
      color: textColor,
      align: 'center',
      baseline: 'middle',
    });
    drawText(ctx, `${entry.count}`, x + layout.paletteCardWidth / 2, y + layout.paletteCardHeight - swatchInset, {
      font: `700 ${layout.paletteCountFontSize}px Nunito, sans-serif`,
      color: '#5D534A',
      align: 'center',
      baseline: 'middle',
    });
  });

  if (!showSymbolStats) {
    ctx.save();
    ctx.fillStyle = 'rgba(93,83,74,0.62)';
    ctx.font = `700 ${clamp(layout.subtitleFontSize, 10, 18)}px Nunito, sans-serif`;
    ctx.fillText('物料清单已关闭', layout.leftMargin, paletteStartY + layout.paletteCardHeight + layout.paletteRowGap);
    ctx.restore();
  }

  if (addWatermark) {
    const watermarkText = normalizedAuthorName;
    ctx.save();
    ctx.globalAlpha = 0.11;
    ctx.fillStyle = '#C593D4';
    ctx.font = `800 ${Math.max(14, Math.round(cellSize * 0.28))}px Nunito, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.translate(canvasWidth / 2, canvasHeight / 2);
    ctx.rotate(-Math.PI / 6);
    if (watermarkText) {
      for (let y = -canvasHeight; y < canvasHeight * 1.5; y += 96) {
        for (let x = -canvasWidth; x < canvasWidth * 1.5; x += 220) {
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
