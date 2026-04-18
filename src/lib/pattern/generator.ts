import { buildPalette, getVendorCode, type PatternPaletteColor, type PatternRgb } from './color-system';
import type { PatternCell, PatternResult, WorkshopConfig, WorkshopStyle } from '../../features/workshop/model/types';

function colorDistance(a: PatternRgb, b: PatternRgb) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function findClosestPaletteColor(target: PatternRgb, palette: PatternPaletteColor[]) {
  let best = palette[0];
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of palette) {
    const distance = colorDistance(target, candidate.rgb);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }

  return best;
}

function getRepresentativeColor(
  imageData: ImageData,
  startX: number,
  startY: number,
  width: number,
  height: number,
  style: WorkshopStyle,
): PatternRgb | null {
  const mode = style === '写实' ? 'average' : 'dominant';
  const { data, width: imageWidth } = imageData;
  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  let counted = 0;
  const frequency = new Map<string, { count: number; rgb: PatternRgb }>();

  for (let y = startY; y < startY + height; y++) {
    for (let x = startX; x < startX + width; x++) {
      const index = (y * imageWidth + x) * 4;
      if (data[index + 3] < 128) continue;

      const rgb = { r: data[index], g: data[index + 1], b: data[index + 2] };
      counted += 1;

      if (mode === 'average') {
        totalR += rgb.r;
        totalG += rgb.g;
        totalB += rgb.b;
      } else {
        const key = `${rgb.r},${rgb.g},${rgb.b}`;
        const current = frequency.get(key);
        if (current) {
          current.count += 1;
        } else {
          frequency.set(key, { count: 1, rgb });
        }
      }
    }
  }

  if (counted === 0) return null;

  if (mode === 'average') {
    return {
      r: Math.round(totalR / counted),
      g: Math.round(totalG / counted),
      b: Math.round(totalB / counted),
    };
  }

  let best: PatternRgb | null = null;
  let bestCount = -1;

  for (const entry of frequency.values()) {
    if (entry.count > bestCount) {
      bestCount = entry.count;
      best = entry.rgb;
    }
  }

  return best;
}

function mergeSimilarCells(cells: PatternCell[], palette: PatternPaletteColor[], threshold: number) {
  const merged = cells.map((cell) => ({ ...cell }));
  const colorToRgb = new Map(palette.map((color) => [color.colorId, color.rgb] as const));
  const counts = new Map<string, number>();

  for (const cell of merged) {
    if (cell.isExternal) continue;
    counts.set(cell.colorId, (counts.get(cell.colorId) ?? 0) + 1);
  }

  const ordered = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([key]) => key);
  const replaced = new Set<string>();

  for (let i = 0; i < ordered.length; i++) {
    const sourceKey = ordered[i];
    if (replaced.has(sourceKey)) continue;
    const sourceRgb = colorToRgb.get(sourceKey);
    if (!sourceRgb) continue;

    for (let j = i + 1; j < ordered.length; j++) {
      const targetKey = ordered[j];
      if (replaced.has(targetKey)) continue;
      const targetRgb = colorToRgb.get(targetKey);
      if (!targetRgb) continue;

      if (colorDistance(sourceRgb, targetRgb) < threshold) {
        replaced.add(targetKey);
        for (const cell of merged) {
          if (cell.colorId === targetKey) {
            cell.colorId = sourceKey;
            cell.hex = sourceKey;
          }
        }
      }
    }
  }

  return merged;
}

function toMergeThreshold(input: number, style: WorkshopStyle) {
  const base = 8 + (input / 100) * 40;
  if (style === '极简') return base + 10;
  if (style === '动漫') return base + 4;
  return base;
}

export async function generatePatternFromImage(params: {
  imageUrl: string;
  config: WorkshopConfig;
}): Promise<PatternResult> {
  const { imageUrl, config } = params;
  const image = await loadImage(imageUrl);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('无法创建图像处理上下文');
  }

  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const width = config.canvasSize;
  const height = config.canvasSize;
  const palette = buildPalette(config.brand);
  const rawCells: PatternCell[] = [];
  const cellWidth = canvas.width / width;
  const cellHeight = canvas.height / height;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const startX = Math.floor(x * cellWidth);
      const startY = Math.floor(y * cellHeight);
      const endX = Math.min(canvas.width, Math.ceil((x + 1) * cellWidth));
      const endY = Math.min(canvas.height, Math.ceil((y + 1) * cellHeight));
      const representative = getRepresentativeColor(
        imageData,
        startX,
        startY,
        Math.max(1, endX - startX),
        Math.max(1, endY - startY),
        config.style,
      );

      if (!representative) {
        rawCells.push({
          x,
          y,
          colorId: '#FFFFFF',
          vendorCode: getVendorCode('#FFFFFF', config.brand),
          hex: '#FFFFFF',
          isExternal: true,
        });
        continue;
      }

      const closest = findClosestPaletteColor(representative, palette);
      rawCells.push({
        x,
        y,
        colorId: closest.colorId,
        vendorCode: closest.vendorCode,
        hex: closest.hex,
      });
    }
  }

  const mergedCells = mergeSimilarCells(rawCells, palette, toMergeThreshold(config.colorMergeThreshold, config.style)).map((cell) => ({
    ...cell,
    vendorCode: getVendorCode(cell.hex, config.brand),
  }));

  const paletteCounts = new Map<string, { hex: string; vendorCode: string; count: number }>();
  for (const cell of mergedCells) {
    if (cell.isExternal) continue;
    const current = paletteCounts.get(cell.colorId);
    if (current) {
      current.count += 1;
    } else {
      paletteCounts.set(cell.colorId, {
        hex: cell.hex,
        vendorCode: cell.vendorCode,
        count: 1,
      });
    }
  }

  return {
    width,
    height,
    cells: mergedCells,
    palette: [...paletteCounts.entries()]
      .map(([colorId, value]) => ({
        colorId,
        hex: value.hex,
        vendorCode: value.vendorCode,
        count: value.count,
      }))
      .sort((a, b) => b.count - a.count),
    stats: {
      totalCells: mergedCells.filter((cell) => !cell.isExternal).length,
      colorCount: paletteCounts.size,
    },
  };
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片加载失败'));
    image.src = src;
  });
}
